import { scheduleDashboardInvalidation } from "../../../common/cache/dashboard-cache";
import { AppError } from "../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../common/constants/httpStatus";
import { db } from "../../../database/postgres";
import { auditService } from "../../audit/audit.service";
import { applyRefundToInvoice } from "../domain/invoice.domain";
import { toInvoiceDto, toMinorUnits, toRefundDto, type InvoiceResponseDto, type RefundResponseDto } from "../domain/payment.dto";
import { invoiceRepository } from "../infrastructure/invoice.repository";
import { ledgerService } from "./ledger.service";
import { paymentRepository } from "../infrastructure/payment.repository";
import { refundRepository } from "../infrastructure/refund.repository";

const IDEMPOTENCY_OP_REFUND = "REFUND" as const;

export type CreateRefundResult = {
  refund: RefundResponseDto;
  invoice: InvoiceResponseDto;
};

export const refundService = {
  async createRefund(input: {
    tenantId: string;
    userId: string;
    transactionId: string;
    amount: number;
    idempotencyKey: string;
    reason?: string;
  }): Promise<CreateRefundResult> {
    const amountMinor = toMinorUnits(input.amount);
    if (amountMinor <= 0) {
      throw new AppError("Refund amount must be positive", HTTP_STATUS.BAD_REQUEST, "INVALID_AMOUNT");
    }

    return db.transaction(async (client) => {
      await paymentRepository.acquireIdempotencyLock(
        client,
        `${input.tenantId}:${IDEMPOTENCY_OP_REFUND}:${input.idempotencyKey}`
      );

      const cached = await paymentRepository.getIdempotencyResponse<CreateRefundResult>(
        input.tenantId,
        IDEMPOTENCY_OP_REFUND,
        input.idempotencyKey,
        client
      );
      if (cached) {
        return cached;
      }

      const lockedTx = await paymentRepository.lockByIdForUpdate(input.tenantId, input.transactionId, client);
      if (!lockedTx) {
        throw new AppError("Transaction not found", HTTP_STATUS.NOT_FOUND, "TX_NOT_FOUND");
      }

      if (lockedTx.status !== "SUCCESS") {
        throw new AppError("Only successful payments can be refunded", HTTP_STATUS.BAD_REQUEST, "TX_NOT_REFUNDABLE");
      }

      const alreadyRefundedMinor = await refundRepository.sumRefundedForTransaction(input.tenantId, lockedTx.id, client);
      const refundableMinor = lockedTx.amountMinor - alreadyRefundedMinor;
      if (amountMinor > refundableMinor) {
        throw new AppError("Refund exceeds remaining amount for this transaction", HTTP_STATUS.BAD_REQUEST, "OVER_REFUND");
      }

      const lockedInvoice = await invoiceRepository.lockByIdForUpdate(input.tenantId, lockedTx.invoiceId, client);

      if (lockedInvoice.paidAmountMinor < amountMinor) {
        throw new AppError("Refund exceeds invoice paid balance", HTTP_STATUS.BAD_REQUEST, "REFUND_EXCEEDS_INVOICE_PAID");
      }

      const refund = await refundRepository.insert(
        {
          tenantId: input.tenantId,
          invoiceId: lockedInvoice.id,
          transactionId: lockedTx.id,
          amountMinor,
          reason: input.reason?.trim() ? input.reason.trim() : null,
          createdByUserId: input.userId
        },
        client
      );

      const updatedInvoice = applyRefundToInvoice({ ...lockedInvoice }, amountMinor);
      await invoiceRepository.updateTotals(updatedInvoice, client);

      await ledgerService.createLedgerReversalForRefund(refund, lockedTx.method, client);

      const response: CreateRefundResult = {
        refund: toRefundDto(refund),
        invoice: toInvoiceDto(updatedInvoice)
      };

      await paymentRepository.saveIdempotencyResponse(
        input.tenantId,
        IDEMPOTENCY_OP_REFUND,
        input.idempotencyKey,
        response,
        client
      );

      auditService.log({
        userId: input.userId,
        tenantId: input.tenantId,
        action: "REFUND_ISSUED",
        entity: "Refund",
        entityId: refund.id,
        metadata: {
          transactionId: lockedTx.id,
          invoiceId: lockedInvoice.id,
          amount: response.refund.amount,
          reason: refund.reason
        }
      });

      return response;
    }).finally(() => scheduleDashboardInvalidation(input.tenantId));
  },

  async listRefundsForInvoice(tenantId: string, invoiceId: string): Promise<{ refunds: RefundResponseDto[] }> {
    await invoiceRepository.findById(tenantId, invoiceId);
    const rows = await refundRepository.listByInvoiceId(tenantId, invoiceId);
    return { refunds: rows.map(toRefundDto) };
  }
};
