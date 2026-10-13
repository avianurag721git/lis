import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { maxDiscountPercentForRole, UserRole } from "../auth/auth.types";
import { logger } from "../../common/logger/logger";
import { cashierService } from "../cashier/cashier.service";
import { ordersService } from "../orders/orders.service";
import { CollectPaymentInput } from "../cashier/cashier.types";
import { resolveTenantDefaultGst } from "../tenant/tenantFinance";

const notifyManagerDiscount = async (input: {
  tenantId: string;
  orderId: string;
  discountPercent: number;
  requestedBy: string;
  role: string;
}): Promise<void> => {
  logger.warn(input, "DISCOUNT_PENDING_APPROVAL — notify Lab Manager");
  if (env.inventoryAlertWebhookUrl) {
    try {
      await fetch(env.inventoryAlertWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "DISCOUNT_PENDING_APPROVAL",
          channel: "EMAIL",
          ...input
        })
      });
    } catch (err) {
      logger.error({ err }, "Discount approval notification failed");
    }
  }
};

export const billingService = {
  /**
   * Create/refresh tax invoice with GST + role discount matrix.
   * Over-limit discounts → PENDING_APPROVAL (held until manager approves).
   */
  async createInvoice(
    tenantId: string,
    userId: string,
    role: UserRole,
    input: {
      orderId: string;
      discountMinor?: number;
      taxRatePercent?: number;
      taxExempt?: boolean;
      patientGstin?: string | null;
      interstate?: boolean;
      payments?: Array<{
        amountMinor: number;
        method: CollectPaymentInput["method"];
        tpaInsurer?: string | null;
        tpaClaimId?: string | null;
        transactionReference?: string | null;
      }>;
      referredDoctor?: string | null;
      referralDoctorId?: string | null;
    }
  ) {
    if (!env.databaseUrl) {
      throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
    }

    const bill = await cashierService.getBill(tenantId, input.orderId, role);
    if (
      bill.invoice &&
      (bill.paymentStatus === "PAID" || bill.paymentStatus === "WALLET_SETTLED" || bill.invoice.status === "PAID")
    ) {
      return {
        bill,
        invoice: bill.invoice,
        payments: [] as Awaited<ReturnType<typeof cashierService.collectPayment>>["payment"][],
        discountStatus: "APPROVED" as const,
        message: `Invoice ${bill.invoice.invoiceNumber} is already paid.`,
        alreadySettled: true as const
      };
    }

    const discountMinor = Math.max(0, input.discountMinor ?? bill.discountMinor);
    const tenantGst = await resolveTenantDefaultGst(tenantId);
    const taxRate =
      input.taxExempt === true ? 0 : (input.taxRatePercent ?? bill.taxRatePercent ?? tenantGst);
    const maxPct = maxDiscountPercentForRole(role);
    const discountPercent = bill.subtotalMinor > 0 ? (discountMinor / bill.subtotalMinor) * 100 : 0;
    const needsApproval = discountPercent > maxPct + 0.001;

    const appliedDiscount = needsApproval
      ? Math.round((bill.subtotalMinor * maxPct) / 100)
      : discountMinor;

    await cashierService.adjustItems(tenantId, userId, role, {
      orderId: input.orderId,
      discountMinor: appliedDiscount,
      taxRatePercent: taxRate,
      ...(input.referredDoctor !== undefined ? { referredDoctor: input.referredDoctor } : {}),
      ...(input.referralDoctorId !== undefined ? { referralDoctorId: input.referralDoctorId } : {})
    });

    const invoiceOpts: { patientGstin?: string | null; interstate?: boolean } = {};
    if (input.patientGstin !== undefined) invoiceOpts.patientGstin = input.patientGstin;
    if (input.interstate !== undefined) invoiceOpts.interstate = input.interstate;
    const created = await cashierService.createTaxInvoice(
      tenantId,
      userId,
      role,
      input.orderId,
      Object.keys(invoiceOpts).length ? invoiceOpts : undefined
    );

    if (needsApproval) {
      await db.query(
        `UPDATE cashier_invoices
         SET status = 'PENDING_APPROVAL',
             discount_status = 'PENDING_APPROVAL',
             requested_discount_minor = $3,
             discount_request_note = $4,
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [
          created.invoice.id,
          tenantId,
          discountMinor,
          `Requested ${discountPercent.toFixed(1)}% exceeds ${maxPct}% for role ${role}`
        ]
      );

      await notifyManagerDiscount({
        tenantId,
        orderId: input.orderId,
        discountPercent,
        requestedBy: userId,
        role
      });

      const refreshed = await cashierService.getBill(tenantId, input.orderId);
      return {
        bill: refreshed,
        invoice: {
          ...created.invoice,
          status: "PENDING_APPROVAL",
          discountStatus: "PENDING_APPROVAL" as const,
          requestedDiscountMinor: discountMinor
        },
        payments: [] as Awaited<ReturnType<typeof cashierService.collectPayment>>["payment"][],
        discountStatus: "PENDING_APPROVAL" as const,
        message: `Discount ${discountPercent.toFixed(1)}% requires Lab Manager approval (your max ${maxPct}%).`
      };
    }

    await db.query(
      `UPDATE cashier_invoices
       SET discount_status = 'APPROVED', requested_discount_minor = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [created.invoice.id, tenantId, discountMinor]
    );

    const payments = [];
    let remainingDue = Number(
      (
        await db.query(`SELECT due_amount_minor FROM cashier_invoices WHERE id = $1`, [created.invoice.id])
      ).rows[0]?.due_amount_minor ?? created.invoice.dueAmountMinor
    );
    for (const p of input.payments ?? []) {
      if (p.amountMinor <= 0 || remainingDue <= 0) continue;
      const amountMinor = Math.min(p.amountMinor, remainingDue);
      const payInput: {
        orderId: string;
        amountMinor: number;
        method: CollectPaymentInput["method"];
        tpaInsurer?: string | null;
        tpaClaimId?: string | null;
        transactionReference?: string | null;
      } = {
        orderId: input.orderId,
        amountMinor,
        method: p.method
      };
      if (p.tpaInsurer !== undefined) payInput.tpaInsurer = p.tpaInsurer;
      if (p.tpaClaimId !== undefined) payInput.tpaClaimId = p.tpaClaimId;
      if (p.transactionReference !== undefined) payInput.transactionReference = p.transactionReference;
      const paid = await cashierService.collectPayment(tenantId, userId, role, payInput);
      payments.push(paid.payment);
      remainingDue = Math.max(0, remainingDue - amountMinor);
    }

    const finalBill = await cashierService.getBill(tenantId, input.orderId);
    return {
      bill: finalBill,
      invoice: created.invoice,
      payments,
      discountStatus: "APPROVED" as const,
      message: "Invoice created"
    };
  },

  async approveDiscount(tenantId: string, userId: string, role: UserRole, orderId: string) {
    if (role !== "MANAGER" && role !== "TENANT_ADMIN" && role !== "SUPER_ADMIN") {
      throw new AppError("Only managers/admins can approve discounts", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    }
    const inv = (
      await db.query(
        `SELECT * FROM cashier_invoices WHERE tenant_id = $1 AND order_id = $2 LIMIT 1`,
        [tenantId, orderId]
      )
    ).rows[0];
    if (!inv) throw new AppError("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
    if (inv.discount_status !== "PENDING_APPROVAL") {
      throw new AppError("No pending discount approval", HTTP_STATUS.CONFLICT, "NOT_PENDING");
    }

    const requested = Number(inv.requested_discount_minor);
    await cashierService.adjustItems(tenantId, userId, role, {
      orderId,
      discountMinor: requested
    });
    const bill = await cashierService.getBill(tenantId, orderId);
    const discountPercent =
      bill.subtotalMinor > 0 ? Math.round((bill.discountMinor / bill.subtotalMinor) * 10000) / 100 : 0;
    const taxable = Math.max(0, bill.subtotalMinor - bill.discountMinor);

    await db.query(
      `UPDATE cashier_invoices
       SET discount_status = 'APPROVED',
           status = CASE
             WHEN paid_amount_minor >= $5 THEN 'PAID'
             WHEN paid_amount_minor > 0 THEN 'PARTIALLY_PAID'
             ELSE 'UNPAID'
           END,
           discount_minor = $2,
           discount_percent = $3,
           taxable_minor = $4,
           net_amount_minor = $5,
           due_amount_minor = GREATEST(0, $5 - paid_amount_minor),
           discount_authorized_by = $6,
           discount_authorizer_role = $7,
           updated_at = NOW()
       WHERE id = $1`,
      [inv.id, bill.discountMinor, discountPercent, taxable, bill.netAmountMinor, userId, role]
    );

    return { bill: await cashierService.getBill(tenantId, orderId), discountStatus: "APPROVED" as const };
  },

  async createWalkInOrderAndInvoice(
    tenantId: string,
    userId: string,
    role: UserRole,
    input: {
      patientId?: string;
      patient?: {
        name?: string;
        phone?: string;
        mobile?: string;
        gender?: "MALE" | "FEMALE" | "OTHER" | null;
        ageYears?: number | null;
      };
      items: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string; quantity?: number }>;
      discountMinor?: number;
      taxRatePercent?: number;
      taxExempt?: boolean;
      referredDoctor?: string | null;
      referralDoctorId?: string | null;
      payments?: Array<{
        amountMinor: number;
        method: CollectPaymentInput["method"];
        tpaInsurer?: string | null;
        tpaClaimId?: string | null;
        transactionReference?: string | null;
      }>;
    }
  ) {
    const tenantGst = await resolveTenantDefaultGst(tenantId);
    const gst = input.taxExempt ? 0 : (input.taxRatePercent ?? tenantGst);
    const bookInput: Parameters<typeof ordersService.book>[2] = {
      collectionType: "WALK_IN",
      discountMinor: 0,
      taxRatePercent: gst,
      items: input.items,
      ...(input.patientId !== undefined ? { patientId: input.patientId } : {}),
      ...(input.patient !== undefined ? { patient: input.patient } : {}),
      ...(input.referredDoctor !== undefined ? { referredDoctor: input.referredDoctor } : {}),
      ...(input.referralDoctorId !== undefined ? { referralDoctorId: input.referralDoctorId } : {})
    };
    const booked = await ordersService.book(tenantId, userId, bookInput);

    const invoiced = await this.createInvoice(tenantId, userId, role, {
      orderId: booked.order.id,
      discountMinor: input.discountMinor ?? 0,
      taxRatePercent: gst,
      ...(input.taxExempt !== undefined ? { taxExempt: input.taxExempt } : {}),
      ...(input.referredDoctor !== undefined ? { referredDoctor: input.referredDoctor } : {}),
      ...(input.referralDoctorId !== undefined ? { referralDoctorId: input.referralDoctorId } : {}),
      ...(input.payments !== undefined ? { payments: input.payments } : {})
    });

    return {
      ...invoiced,
      order: booked.order,
      samples: booked.samples,
      barcodeStickerPayloads: booked.barcodeStickerPayloads
    };
  }
};
