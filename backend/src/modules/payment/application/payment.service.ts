import Stripe from "stripe";
import { scheduleDashboardInvalidation } from "../../../common/cache/dashboard-cache";
import { AppError } from "../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../common/constants/httpStatus";
import { env } from "../../../config/env";
import { db } from "../../../database/postgres";
import { auditService } from "../../audit/audit.service";
import { jobsRepository } from "../../jobs/jobs.repository";
import { invoiceRepository } from "../infrastructure/invoice.repository";
import { applyPaymentToInvoice } from "../domain/invoice.domain";
import { invoiceService } from "./invoice.service";
import { ledgerService } from "./ledger.service";
import { toInvoiceDto, toMinorUnits } from "../domain/payment.dto";
import { paymentRepository } from "../infrastructure/payment.repository";
import { PaymentMethod, PaymentTransaction } from "../domain/payment.types";

/** Lazy client so the process can boot when `STRIPE_SECRET_KEY` is unset (e.g. Docker Compose without Stripe). */
let stripeClient: Stripe | null = null;

const getStripe = (): Stripe => {
  if (!env.stripeSecretKey) {
    throw new AppError("Stripe is not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "PAYMENT_CONFIG_MISSING");
  }
  stripeClient ??= new Stripe(env.stripeSecretKey, { apiVersion: "2026-10-28.endive" });
  return stripeClient;
};

const IDEMPOTENCY_OPS = {
  CREATE_INVOICE: "CREATE_INVOICE",
  ADD_PAYMENT: "ADD_PAYMENT",
  INITIATE_ONLINE: "INITIATE_ONLINE",
  VERIFY_PAYMENT: "VERIFY_PAYMENT"
} as const;

type AddPaymentResult = { invoice: ReturnType<typeof toInvoiceDto>; transaction: Record<string, unknown> };

const toTransactionDto = (tx: PaymentTransaction): Record<string, unknown> => ({
  id: tx.id,
  invoiceId: tx.invoiceId,
  amount: Number((tx.amountMinor / 100).toFixed(2)),
  method: tx.method,
  status: tx.status,
  transactionReference: tx.transactionReference,
  gatewayOrderId: tx.gatewayOrderId,
  createdAt: tx.createdAt
});

export const paymentService = {
  async createInvoiceWithIdempotency(
    tenantId: string,
    patientId: string,
    totalAmount: number,
    idempotencyKey: string
  ): Promise<{ invoice: ReturnType<typeof toInvoiceDto> }> {
    return db.transaction(async (client) => {
      await paymentRepository.acquireIdempotencyLock(client, `${tenantId}:${IDEMPOTENCY_OPS.CREATE_INVOICE}:${idempotencyKey}`);
      const cached = await paymentRepository.getIdempotencyResponse<{ invoice: ReturnType<typeof toInvoiceDto> }>(
        tenantId,
        IDEMPOTENCY_OPS.CREATE_INVOICE,
        idempotencyKey,
        client
      );
      if (cached) {
        return cached;
      }
      const totalAmountMinor = toMinorUnits(totalAmount);
      const invoice = await invoiceRepository.insert({ tenantId, patientId, totalAmountMinor }, client);
      const payload = { invoice: toInvoiceDto(invoice) };
      await paymentRepository.saveIdempotencyResponse(tenantId, IDEMPOTENCY_OPS.CREATE_INVOICE, idempotencyKey, payload, client);
      return payload;
    }).finally(() => scheduleDashboardInvalidation(tenantId));
  },

  async addPayment(input: {
    tenantId: string;
    userId: string;
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    idempotencyKey: string;
    transactionReference?: string;
  }): Promise<AddPaymentResult> {
    if (input.method === "ONLINE") {
      throw new AppError("Online payments require order creation", HTTP_STATUS.BAD_REQUEST, "USE_ONLINE_ORDER_FLOW");
    }
    const amountMinor = toMinorUnits(input.amount);
    const txRef = input.transactionReference ?? null;
    if (txRef && (await paymentRepository.existsByTransactionReference(txRef))) {
      throw new AppError("Duplicate transaction reference", HTTP_STATUS.CONFLICT, "DUPLICATE_TRANSACTION_REFERENCE");
    }

    return db.transaction(async (client) => {
      await paymentRepository.acquireIdempotencyLock(
        client,
        `${input.tenantId}:${IDEMPOTENCY_OPS.ADD_PAYMENT}:${input.idempotencyKey}`
      );
      const cached = await paymentRepository.getIdempotencyResponse<AddPaymentResult>(
        input.tenantId,
        IDEMPOTENCY_OPS.ADD_PAYMENT,
        input.idempotencyKey,
        client
      );
      if (cached) {
        return cached;
      }

      const lockedInvoice = await invoiceRepository.lockByIdForUpdate(input.tenantId, input.invoiceId, client);
      const paymentTx = await paymentRepository.insertTransaction(
        {
          tenantId: input.tenantId,
          invoiceId: lockedInvoice.id,
          amountMinor,
          method: input.method,
          status: "SUCCESS",
          transactionReference: txRef
        },
        client
      );

      const updatedInvoice = applyPaymentToInvoice({ ...lockedInvoice }, amountMinor);
      await invoiceRepository.updateTotals(updatedInvoice, client);
      await ledgerService.createLedgerEntriesForSuccessfulPayment(paymentTx, client);

      const response: AddPaymentResult = {
        invoice: toInvoiceDto(updatedInvoice),
        transaction: toTransactionDto(paymentTx)
      };

      await paymentRepository.saveIdempotencyResponse(
        input.tenantId,
        IDEMPOTENCY_OPS.ADD_PAYMENT,
        input.idempotencyKey,
        response,
        client
      );

      auditService.log({
        userId: input.userId,
        tenantId: input.tenantId,
        action: "PAYMENT_ADDED",
        entity: "PaymentTransaction",
        entityId: paymentTx.id,
        metadata: { method: paymentTx.method, amount: response.transaction.amount, invoiceId: updatedInvoice.id }
      });
      if (updatedInvoice.status === "PAID") {
        auditService.log({
          userId: input.userId,
          tenantId: input.tenantId,
          action: "INVOICE_CLOSED",
          entity: "Invoice",
          entityId: updatedInvoice.id,
          metadata: { totalAmount: toInvoiceDto(updatedInvoice).totalAmount }
        });
      }

      return response;
    }).finally(() => scheduleDashboardInvalidation(input.tenantId));
  },

  async createPaymentOrder(input: {
    tenantId: string;
    userId: string;
    invoiceId: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<{ transactionId: string; gatewayOrderId: string; clientSecret: string }> {
    if (!env.stripeSecretKey) {
      throw new AppError("Stripe is not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "PAYMENT_CONFIG_MISSING");
    }
    const amountMinor = toMinorUnits(input.amount);

    const cachedRead = await db.transaction(async (client) => {
      await paymentRepository.acquireIdempotencyLock(
        client,
        `${input.tenantId}:${IDEMPOTENCY_OPS.INITIATE_ONLINE}:${input.idempotencyKey}`
      );
      return paymentRepository.getIdempotencyResponse<{
        transactionId: string;
        gatewayOrderId: string;
        clientSecret: string;
      }>(input.tenantId, IDEMPOTENCY_OPS.INITIATE_ONLINE, input.idempotencyKey, client);
    });
    if (cachedRead) {
      return cachedRead;
    }

    const preview = await invoiceRepository.findById(input.tenantId, input.invoiceId);
    if (amountMinor > preview.dueAmountMinor) {
      throw new AppError("Payment exceeds due amount", HTTP_STATUS.BAD_REQUEST, "OVERPAYMENT_NOT_ALLOWED");
    }

    const intent = await getStripe().paymentIntents.create({
      amount: amountMinor,
      currency: "inr",
      metadata: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        initiatedBy: input.userId
      }
    });

    return db.transaction(async (client) => {
      await paymentRepository.acquireIdempotencyLock(
        client,
        `${input.tenantId}:${IDEMPOTENCY_OPS.INITIATE_ONLINE}:${input.idempotencyKey}`
      );
      const cached = await paymentRepository.getIdempotencyResponse<{
        transactionId: string;
        gatewayOrderId: string;
        clientSecret: string;
      }>(input.tenantId, IDEMPOTENCY_OPS.INITIATE_ONLINE, input.idempotencyKey, client);
      if (cached) {
        return cached;
      }

      const lockedInvoice = await invoiceRepository.lockByIdForUpdate(input.tenantId, input.invoiceId, client);
      if (amountMinor > lockedInvoice.dueAmountMinor) {
        throw new AppError("Payment exceeds due amount", HTTP_STATUS.BAD_REQUEST, "OVERPAYMENT_NOT_ALLOWED");
      }

      const paymentTx = await paymentRepository.insertTransaction(
        {
          tenantId: input.tenantId,
          invoiceId: lockedInvoice.id,
          amountMinor,
          method: "ONLINE",
          status: "PENDING",
          gatewayOrderId: intent.id
        },
        client
      );

      const payload = {
        transactionId: paymentTx.id,
        gatewayOrderId: intent.id,
        clientSecret: intent.client_secret ?? ""
      };
      await paymentRepository.saveIdempotencyResponse(
        input.tenantId,
        IDEMPOTENCY_OPS.INITIATE_ONLINE,
        input.idempotencyKey,
        payload,
        client
      );
      return payload;
    }).finally(() => scheduleDashboardInvalidation(input.tenantId));
  },

  async verifyPayment(input: {
    tenantId: string;
    userId: string;
    gatewayOrderId: string;
    paymentIntentId: string;
    idempotencyKey: string;
  }): Promise<{ status: string; invoice: ReturnType<typeof toInvoiceDto> }> {
    if (!env.stripeSecretKey) {
      throw new AppError("Stripe is not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "PAYMENT_CONFIG_MISSING");
    }

    const intent = await getStripe().paymentIntents.retrieve(input.paymentIntentId);

    if (intent.id !== input.gatewayOrderId) {
      throw new AppError("Order mismatch", HTTP_STATUS.BAD_REQUEST, "PAYMENT_ORDER_MISMATCH");
    }

    if (intent.metadata.tenantId !== input.tenantId || !intent.metadata.invoiceId) {
      throw new AppError("Tenant or invoice mismatch", HTTP_STATUS.FORBIDDEN, "PAYMENT_SCOPE_VIOLATION");
    }

    return db.transaction(async (client) => {
      const idempotencyCompositeKey = `${input.tenantId}:${IDEMPOTENCY_OPS.VERIFY_PAYMENT}:${intent.metadata.invoiceId}:${input.idempotencyKey}`;

      await paymentRepository.acquireIdempotencyLock(client, idempotencyCompositeKey);

      const cached = await paymentRepository.getIdempotencyResponse<{
        status: string;
        invoice: ReturnType<typeof toInvoiceDto>;
      }>(input.tenantId, IDEMPOTENCY_OPS.VERIFY_PAYMENT, input.idempotencyKey, client);

      if (cached) return cached;

      const lockedTx = await paymentRepository.lockByGatewayOrderIdForUpdate(input.gatewayOrderId, client);

      if (!lockedTx || lockedTx.tenantId !== input.tenantId) {
        throw new AppError("Transaction not found", HTTP_STATUS.NOT_FOUND, "TX_NOT_FOUND");
      }

      if (intent.metadata.invoiceId !== lockedTx.invoiceId) {
        throw new AppError("Invoice mismatch", HTTP_STATUS.FORBIDDEN, "INVOICE_MISMATCH");
      }

      if (lockedTx.status === "SUCCESS") {
        const invoice = await invoiceRepository.findById(input.tenantId, lockedTx.invoiceId, client);

        const payload = { status: "SUCCESS", invoice: toInvoiceDto(invoice) };

        await paymentRepository.saveIdempotencyResponse(
          input.tenantId,
          IDEMPOTENCY_OPS.VERIFY_PAYMENT,
          input.idempotencyKey,
          payload,
          client
        );

        return payload;
      }

      const lockedInvoice = await invoiceRepository.lockByIdForUpdate(input.tenantId, lockedTx.invoiceId, client);

      if (lockedInvoice.status === "PAID") {
        throw new AppError("Invoice already fully paid", HTTP_STATUS.BAD_REQUEST, "INVOICE_ALREADY_PAID");
      }

      if (intent.amount !== lockedTx.amountMinor) {
        throw new AppError("Payment amount mismatch", HTTP_STATUS.BAD_REQUEST, "AMOUNT_MISMATCH");
      }

      const nextStatus = intent.status === "succeeded" ? "SUCCESS" : "FAILED";

      await paymentRepository.updateStatusAndReference(
        {
          ...lockedTx,
          status: nextStatus,
          transactionReference: intent.id
        },
        client
      );

      if (nextStatus === "FAILED") {
        const invoice = await invoiceRepository.findById(input.tenantId, lockedTx.invoiceId, client);

        const payload = { status: "FAILED", invoice: toInvoiceDto(invoice) };

        await paymentRepository.saveIdempotencyResponse(
          input.tenantId,
          IDEMPOTENCY_OPS.VERIFY_PAYMENT,
          input.idempotencyKey,
          payload,
          client
        );

        return payload;
      }

      const updatedInvoice = applyPaymentToInvoice({ ...lockedInvoice }, lockedTx.amountMinor);

      await invoiceRepository.updateTotals(updatedInvoice, client);

      const settledTx: PaymentTransaction = { ...lockedTx, status: "SUCCESS", transactionReference: intent.id };
      await ledgerService.createLedgerEntriesForSuccessfulPayment(settledTx, client);

      const payload = {
        status: "SUCCESS",
        invoice: toInvoiceDto(updatedInvoice)
      };

      await paymentRepository.saveIdempotencyResponse(
        input.tenantId,
        IDEMPOTENCY_OPS.VERIFY_PAYMENT,
        input.idempotencyKey,
        payload,
        client
      );

      auditService.log({
        userId: input.userId,
        tenantId: input.tenantId,
        action: "PAYMENT_ADDED",
        entity: "PaymentTransaction",
        entityId: lockedTx.id,
        metadata: {
          method: lockedTx.method,
          amount: Number((lockedTx.amountMinor / 100).toFixed(2)),
          invoiceId: lockedTx.invoiceId
        }
      });

      return payload;
    }).finally(() => scheduleDashboardInvalidation(input.tenantId));
  },

  async processWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!env.stripeWebhookSecret || !env.stripeSecretKey) {
      throw new AppError("Webhook config missing", HTTP_STATUS.INTERNAL_SERVER_ERROR, "WEBHOOK_CONFIG_MISSING");
    }

    const event = getStripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);

    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const tenantId = intent.metadata.tenantId;
      const invoiceId = intent.metadata.invoiceId;
      if (!tenantId || !invoiceId) {
        return;
      }

      await db
        .transaction(async (client) => {
          const lockedTx = await paymentRepository.lockByGatewayOrderIdForUpdate(intent.id, client);
          if (!lockedTx || lockedTx.tenantId !== tenantId || lockedTx.invoiceId !== invoiceId || lockedTx.status === "SUCCESS") {
            return;
          }

          const nextStatus = event.type === "payment_intent.succeeded" ? "SUCCESS" : "FAILED";
          const nextTx: PaymentTransaction = {
            ...lockedTx,
            transactionReference: intent.id,
            status: nextStatus
          };
          await paymentRepository.updateStatusAndReference(nextTx, client);

          if (nextTx.status === "SUCCESS") {
            const lockedInvoice = await invoiceRepository.lockByIdForUpdate(tenantId, nextTx.invoiceId, client);
            const updatedInvoice = applyPaymentToInvoice({ ...lockedInvoice }, nextTx.amountMinor);
            await invoiceRepository.updateTotals(updatedInvoice, client);
            await ledgerService.createLedgerEntriesForSuccessfulPayment(nextTx, client);
          }
        })
        .finally(() => scheduleDashboardInvalidation(tenantId));
    }
  },

  /**
   * Fetches stale PENDING gateway captures, verifies each with Stripe, and applies SUCCESS/FAILED locally inside DB transactions.
   */
  async reconcilePendingPaymentsWithStripe(): Promise<{
    scanned: number;
    succeeded: number;
    failed: number;
    skipped: number;
    errors: number;
  }> {
    const pending = await paymentRepository.listPendingOnlineOlderThan(15);
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let errors = 0;

    for (const tx of pending) {
      if (!tx.gatewayOrderId || !env.stripeSecretKey) {
        skipped += 1;
        continue;
      }
      try {
        const result = await this.verifyPayment({
          tenantId: tx.tenantId,
          userId: "SYSTEM_RECONCILIATION",
          gatewayOrderId: tx.gatewayOrderId,
          paymentIntentId: tx.gatewayOrderId,
          idempotencyKey: `reconcile:${tx.gatewayOrderId}`
        });
        if (result.status === "SUCCESS") {
          succeeded += 1;
        } else {
          failed += 1;
        }
      } catch {
        errors += 1;
        void jobsRepository.enqueuePaymentReverify({ tenantId: tx.tenantId, gatewayOrderId: tx.gatewayOrderId }).catch(() => undefined);
      }
    }

    return { scanned: pending.length, succeeded, failed, skipped, errors };
  },

  async reconcilePendingGatewayTransactions(): Promise<number> {
    const run = await this.reconcilePendingPaymentsWithStripe();
    return run.scanned;
  },

  getInvoice(tenantId: string, invoiceId: string): Promise<{ invoice: ReturnType<typeof toInvoiceDto> }> {
    return invoiceService.getInvoiceById(tenantId, invoiceId);
  },

  async getPaymentHistory(tenantId: string, invoiceId: string): Promise<{ transactions: Record<string, unknown>[] }> {
    await invoiceRepository.findById(tenantId, invoiceId);
    const items = await paymentRepository.listByInvoice(tenantId, invoiceId);
    return { transactions: items.map((tx) => toTransactionDto(tx)) };
  }
};
