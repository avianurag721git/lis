import { randomUUID } from "crypto";
import { db, type DbClient } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { maxDiscountPercentForRole, UserRole } from "../auth/auth.types";
import { tenantService } from "../tenant/tenant.service";
import {
  AdjustOrderItemsInput,
  CashierInvoice,
  CashierPayment,
  CollectPaymentInput,
  InvoiceListItem,
  OrderBill,
  OrderBillLine
} from "./cashier.types";
import { taxInvoicePdf } from "./taxInvoicePdf";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapInvoice = (r: any): CashierInvoice => ({
  id: r.id,
  orderId: r.order_id,
  invoiceNumber: r.invoice_number,
  patientId: r.patient_id,
  patientName: r.patient_name,
  patientGstin: r.patient_gstin,
  labGstin: r.lab_gstin,
  subtotalMinor: Number(r.subtotal_minor),
  discountMinor: Number(r.discount_minor),
  discountPercent: Number(r.discount_percent),
  taxableMinor: Number(r.taxable_minor),
  cgstMinor: Number(r.cgst_minor),
  sgstMinor: Number(r.sgst_minor),
  igstMinor: Number(r.igst_minor),
  taxRatePercent: Number(r.tax_rate_percent),
  netAmountMinor: Number(r.net_amount_minor),
  paidAmountMinor: Number(r.paid_amount_minor),
  dueAmountMinor: Number(r.due_amount_minor),
  status: r.status,
  discountAuthorizedBy: r.discount_authorized_by,
  discountAuthorizerRole: r.discount_authorizer_role,
  filePath: r.file_path,
  createdAt: new Date(r.created_at).toISOString()
});

const mapLine = (r: any): OrderBillLine => ({
  id: r.id,
  itemType: r.item_type,
  testId: r.test_id,
  packageId: r.package_id,
  name: r.name,
  priceMinor: Number(r.price_minor),
  quantity: Number(r.quantity)
});

const mapPayment = (r: any): CashierPayment => ({
  id: r.id,
  invoiceId: r.invoice_id,
  orderId: r.order_id,
  amountMinor: Number(r.amount_minor),
  method: r.method,
  tpaInsurer: r.tpa_insurer,
  tpaClaimId: r.tpa_claim_id,
  transactionReference: r.transaction_reference,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString()
});

const assertDiscountAllowed = (
  role: UserRole,
  discountMinor: number,
  subtotalMinor: number
): { discountPercent: number } => {
  if (subtotalMinor <= 0) {
    if (discountMinor > 0) {
      throw new AppError("Cannot discount empty bill", HTTP_STATUS.BAD_REQUEST, "EMPTY_BILL");
    }
    return { discountPercent: 0 };
  }
  const discountPercent = (discountMinor / subtotalMinor) * 100;
  const maxPct = maxDiscountPercentForRole(role);
  if (discountPercent > maxPct + 0.001) {
    throw new AppError(
      `Discount ${discountPercent.toFixed(1)}% exceeds ${maxPct}% limit for role ${role}`,
      HTTP_STATUS.FORBIDDEN,
      "DISCOUNT_NOT_AUTHORIZED"
    );
  }
  return { discountPercent: Math.round(discountPercent * 100) / 100 };
};

const resolveTaxRatePercent = (value: unknown, fallback = 18): number => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
};

const resolveTaxRateForTenant = async (
  tenantId: string,
  value: unknown
): Promise<number> => {
  if (value !== null && value !== undefined && value !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const { resolveTenantDefaultGst } = await import("../tenant/tenantFinance");
  return resolveTenantDefaultGst(tenantId);
};

const clampDiscountMinor = (role: UserRole, discountMinor: number, subtotalMinor: number): number => {
  if (subtotalMinor <= 0) return 0;
  const maxPct = maxDiscountPercentForRole(role);
  const maxDisc = Math.round((subtotalMinor * maxPct) / 100);
  return Math.min(Math.max(0, discountMinor), subtotalMinor, maxDisc);
};

const recalcOrderTotals = async (
  tenantId: string,
  orderId: string,
  discountMinor: number,
  taxRatePercent: number,
  role: UserRole,
  userId: string,
  client: DbClient = db,
  policy: "strict" | "clamp" | "retain-percent" = "strict",
  previousSubtotalMinor?: number
): Promise<void> => {
  const items = await client.query(
    `SELECT COALESCE(SUM(price_minor), 0)::bigint AS subtotal FROM order_items WHERE tenant_id = $1 AND order_id = $2`,
    [tenantId, orderId]
  );
  const subtotalMinor = Number(items.rows[0]?.subtotal ?? 0);
  const maxPct = maxDiscountPercentForRole(role);
  let disc: number;
  if (policy === "retain-percent") {
    const priorSub = previousSubtotalMinor ?? subtotalMinor;
    const pct = priorSub > 0 ? discountMinor / priorSub : 0;
    const cappedPct = Math.min(Math.max(0, pct), maxPct / 100);
    disc = Math.round(subtotalMinor * cappedPct);
  } else if (policy === "clamp") {
    disc = clampDiscountMinor(role, discountMinor, subtotalMinor);
  } else {
    disc = Math.min(Math.max(0, discountMinor), subtotalMinor);
    assertDiscountAllowed(role, disc, subtotalMinor);
  }
  const taxable = Math.max(0, subtotalMinor - disc);
  const taxMinor = Math.round((taxable * taxRatePercent) / 100);
  const net = taxable + taxMinor;
  await client.query(
    `UPDATE order_bookings
     SET subtotal_minor = $3, discount_minor = $4, tax_minor = $5, net_amount_minor = $6,
         tax_rate_percent = $7, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, orderId, subtotalMinor, disc, taxMinor, net, taxRatePercent]
  );

  const discountPercent = subtotalMinor > 0 ? Math.round((disc / subtotalMinor) * 10000) / 100 : 0;
  const half = Math.floor(taxMinor / 2);
  await client.query(
    `UPDATE cashier_invoices
     SET subtotal_minor = $3,
         discount_minor = $4,
         discount_percent = $5,
         taxable_minor = $6,
         cgst_minor = $7,
         sgst_minor = $8,
         igst_minor = 0,
         tax_rate_percent = $9,
         net_amount_minor = $10,
         due_amount_minor = GREATEST(0, $10 - paid_amount_minor),
         updated_at = NOW()
     WHERE tenant_id = $1
       AND order_id = $2
       AND status IN ('UNPAID', 'PARTIALLY_PAID', 'PENDING_APPROVAL')`,
    [tenantId, orderId, subtotalMinor, disc, discountPercent, taxable, half, taxMinor - half, taxRatePercent, net]
  );
  void userId;
};

const loadBill = async (tenantId: string, orderId: string, client: DbClient = db): Promise<OrderBill> => {
  const orderResult = await client.query(
    `SELECT o.*, p.name AS patient_name, p.phone AS patient_phone,
            rd.id AS rd_id, rd.doctor_code AS rd_code, rd.commission_percentage AS rd_commission
     FROM order_bookings o
     JOIN patients p ON p.id = o.patient_id
     LEFT JOIN referral_doctors rd ON rd.id = o.referral_doctor_id AND rd.tenant_id = o.tenant_id
     WHERE o.tenant_id = $1 AND o.id = $2 LIMIT 1`,
    [tenantId, orderId]
  );
  const o = orderResult.rows[0];
  if (!o) {
    throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND, "ORDER_NOT_FOUND");
  }
  const itemsResult = await client.query(
    `SELECT * FROM order_items WHERE tenant_id = $1 AND order_id = $2 ORDER BY name ASC`,
    [tenantId, orderId]
  );
  const invResult = await client.query(
    `SELECT * FROM cashier_invoices WHERE tenant_id = $1 AND order_id = $2 LIMIT 1`,
    [tenantId, orderId]
  );
  let sampleLocked = false;
  try {
    const progressed = await client.query(
      `SELECT status FROM samples
       WHERE tenant_id = $1 AND order_id = $2 AND status <> 'PENDING_COLLECTION'
       LIMIT 1`,
      [tenantId, orderId]
    );
    sampleLocked = Boolean(progressed.rows[0]);
  } catch {
    sampleLocked = false;
  }
  const paidLocked =
    o.payment_status === "PAID" || o.payment_status === "WALLET_SETTLED";
  const canRemoveItems = !paidLocked && !sampleLocked;
  let removeItemsBlockedReason: string | null = null;
  if (paidLocked) {
    removeItemsBlockedReason = "This order is fully paid — tests cannot be removed.";
  } else if (sampleLocked) {
    removeItemsBlockedReason =
      "Sample collection has already started for this order. Payment can still be collected, but tests cannot be removed (phlebotomy/lab work is in progress). Ask a lab manager if a test must be cancelled.";
  }

  return {
    orderId: o.id,
    orderNumber: o.order_number,
    patientId: o.patient_id,
    patientName: o.patient_name,
    patientPhone: o.patient_phone,
    referredDoctor: o.referred_doctor ?? null,
    referralDoctorId: o.referral_doctor_id ?? o.rd_id ?? null,
    referralDoctorCode: o.rd_code ?? null,
    referralCommissionPercentage: Number(o.rd_commission ?? 0),
    collectionType: o.collection_type,
    franchiseeId: o.franchisee_id,
    paymentStatus: o.payment_status ?? "UNPAID",
    subtotalMinor: Number(o.subtotal_minor),
    discountMinor: Number(o.discount_minor),
    taxMinor: Number(o.tax_minor),
    taxRatePercent: resolveTaxRatePercent(o.tax_rate_percent),
    netAmountMinor: Number(o.net_amount_minor),
    items: itemsResult.rows.map(mapLine),
    invoice: invResult.rows[0] ? mapInvoice(invResult.rows[0]) : null,
    canRemoveItems,
    removeItemsBlockedReason
  };
};

const expectedNetMinor = (bill: OrderBill): number => {
  const itemSum = bill.items.reduce((sum, item) => sum + item.priceMinor, 0);
  const taxable = Math.max(0, itemSum - bill.discountMinor);
  return taxable + Math.round((taxable * (bill.taxRatePercent || 0)) / 100);
};

const reconcileUnpaidBill = async (
  tenantId: string,
  bill: OrderBill,
  role: UserRole
): Promise<OrderBill> => {
  if (bill.paymentStatus === "PAID" || bill.paymentStatus === "WALLET_SETTLED") {
    return bill;
  }
  const itemSum = bill.items.reduce((sum, item) => sum + item.priceMinor, 0);
  const netMatches = expectedNetMinor({ ...bill, subtotalMinor: itemSum }) === bill.netAmountMinor;
  if (itemSum === bill.subtotalMinor && netMatches) {
    return bill;
  }
  await recalcOrderTotals(
    tenantId,
    bill.orderId,
    bill.discountMinor,
    resolveTaxRatePercent(bill.taxRatePercent),
    role,
    "reconcile",
    db,
    "retain-percent",
    bill.subtotalMinor > 0 ? bill.subtotalMinor : itemSum
  );
  return loadBill(tenantId, bill.orderId);
};

const renderTaxInvoicePdf = async (
  tenantId: string,
  bill: OrderBill,
  invoice: CashierInvoice
): Promise<string> => {
  const branding = await tenantService.resolveTenantConfiguration(tenantId);
  return taxInvoicePdf.generate({
    invoice,
    orderNumber: bill.orderNumber,
    items: bill.items,
    labName: branding.brandingName || "DiagLab Diagnostics",
    patientPhone: bill.patientPhone,
    branding: {
      primaryColor: branding.branding.primaryColor,
      secondaryColor: branding.branding.secondaryColor,
      labHeaderAddress: branding.branding.labHeaderAddress,
      nablRegNo: branding.branding.nablRegNo,
      logoUrl: branding.branding.logoUrl ?? branding.logoUrl
    }
  });
};

export const cashierService = {
  async listUnpaidOrders(tenantId: string, role: UserRole): Promise<OrderBill[]> {
    ensurePg();
    const result = await db.query(
      `SELECT o.id
       FROM order_bookings o
       WHERE o.tenant_id = $1
         AND COALESCE(o.payment_status, 'UNPAID') IN ('UNPAID', 'PARTIALLY_PAID')
         AND o.collection_type <> 'B2B_FRANCHISEE'
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [tenantId]
    );
    const out: OrderBill[] = [];
    for (const row of result.rows) {
      const bill = await loadBill(tenantId, row.id);
      out.push(await reconcileUnpaidBill(tenantId, bill, role));
    }
    return out;
  },

  async getBill(tenantId: string, orderId: string, role: UserRole = "LAB_MANAGER"): Promise<OrderBill> {
    ensurePg();
    const bill = await loadBill(tenantId, orderId);
    return reconcileUnpaidBill(tenantId, bill, role);
  },

  async adjustItems(
    tenantId: string,
    userId: string,
    role: UserRole,
    input: AdjustOrderItemsInput
  ): Promise<OrderBill> {
    ensurePg();
    return db.transaction(async (client) => {
      const existing = await client.query(
        `SELECT * FROM order_bookings WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, input.orderId]
      );
      if (!existing.rows[0]) {
        throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND, "ORDER_NOT_FOUND");
      }
      if (existing.rows[0].payment_status === "PAID" || existing.rows[0].payment_status === "WALLET_SETTLED") {
        throw new AppError("Cannot modify a fully paid order", HTTP_STATUS.CONFLICT, "ORDER_PAID");
      }

      if ((input.removeItemIds ?? []).length > 0) {
        try {
          const progressed = await client.query(
            `SELECT status FROM samples
             WHERE tenant_id = $1 AND order_id = $2
               AND status <> 'PENDING_COLLECTION'
             LIMIT 1`,
            [tenantId, input.orderId]
          );
          if (progressed.rows[0]) {
            const canOverride =
              role === "SUPER_ADMIN" ||
              role === "LAB_MANAGER" ||
              role === "MANAGER" ||
              role === "TENANT_ADMIN";
            if (!canOverride) {
              throw new AppError(
                "Cannot remove tests after sample collection has started. Payment is separate — you can still collect money, but phlebotomy/lab has already begun. Ask a lab manager to cancel a test if needed.",
                HTTP_STATUS.CONFLICT,
                "SAMPLE_IN_PROGRESS"
              );
            }
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
        }
      }

      for (const id of input.removeItemIds ?? []) {
        const deleted = await client.query(
          `DELETE FROM order_items WHERE tenant_id = $1 AND order_id = $2 AND id = $3 RETURNING id`,
          [tenantId, input.orderId, id]
        );
        if (!deleted.rows[0]) {
          throw new AppError("Bill item not found", HTTP_STATUS.NOT_FOUND, "ORDER_ITEM_NOT_FOUND");
        }
      }

      for (const item of input.addItems ?? []) {
        const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
        if (item.itemType === "TEST") {
          if (!item.testId) throw new AppError("testId required", HTTP_STATUS.BAD_REQUEST, "TEST_ID_REQUIRED");
          const t = (
            await client.query(`SELECT id, name, price_minor FROM tests WHERE tenant_id = $1 AND id = $2`, [
              tenantId,
              item.testId
            ])
          ).rows[0];
          if (!t) throw new AppError("Test not found", HTTP_STATUS.NOT_FOUND, "TEST_NOT_FOUND");
          await client.query(
            `INSERT INTO order_items (id, tenant_id, order_id, item_type, test_id, package_id, name, price_minor, quantity)
             VALUES ($1,$2,$3,'TEST',$4,NULL,$5,$6,$7)`,
            [randomUUID(), tenantId, input.orderId, t.id, t.name, Number(t.price_minor) * qty, qty]
          );
        } else {
          if (!item.packageId) throw new AppError("packageId required", HTTP_STATUS.BAD_REQUEST, "PACKAGE_ID_REQUIRED");
          const p = (
            await client.query(`SELECT id, name, price_minor FROM test_packages WHERE tenant_id = $1 AND id = $2`, [
              tenantId,
              item.packageId
            ])
          ).rows[0];
          if (!p) throw new AppError("Package not found", HTTP_STATUS.NOT_FOUND, "PACKAGE_NOT_FOUND");
          await client.query(
            `INSERT INTO order_items (id, tenant_id, order_id, item_type, test_id, package_id, name, price_minor, quantity)
             VALUES ($1,$2,$3,'PACKAGE',NULL,$4,$5,$6,$7)`,
            [randomUUID(), tenantId, input.orderId, p.id, p.name, Number(p.price_minor) * qty, qty]
          );
        }
      }

      if (input.referredDoctor !== undefined || input.referralDoctorId !== undefined) {
        let referredName = input.referredDoctor;
        let referralId = input.referralDoctorId;

        if (input.referralDoctorId !== undefined) {
          if (input.referralDoctorId) {
            const { referralDoctorsService } = await import("../referral-doctors/referralDoctors.service");
            const doc = await referralDoctorsService.getById(tenantId, input.referralDoctorId);
            if (!doc) {
              throw new AppError("Referral doctor not found", HTTP_STATUS.NOT_FOUND, "REFERRAL_DOCTOR_NOT_FOUND");
            }
            referredName = doc.name;
            referralId = doc.id;
          } else {
            referralId = null;
          }
        }

        await client.query(
          `UPDATE order_bookings SET referred_doctor = $3, referral_doctor_id = $4, updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, input.orderId, referredName ?? null, referralId ?? null]
        );
      }

      const taxRate = await resolveTaxRateForTenant(
        tenantId,
        input.taxRatePercent ?? existing.rows[0].tax_rate_percent
      );
      const previousSubtotal = Number(existing.rows[0].subtotal_minor);
      const previousDiscount = Number(existing.rows[0].discount_minor);
      await recalcOrderTotals(
        tenantId,
        input.orderId,
        previousDiscount,
        taxRate,
        role,
        userId,
        client,
        "retain-percent",
        previousSubtotal
      );
      return loadBill(tenantId, input.orderId, client);
    });
  },

  async createTaxInvoice(
    tenantId: string,
    userId: string,
    role: UserRole,
    orderId: string,
    opts?: { patientGstin?: string | null; interstate?: boolean }
  ): Promise<{ bill: OrderBill; invoice: CashierInvoice }> {
    ensurePg();
    const bill = await loadBill(tenantId, orderId);
    if (bill.items.length === 0) {
      throw new AppError("Order has no items", HTTP_STATUS.BAD_REQUEST, "NO_ITEMS");
    }
    assertDiscountAllowed(role, bill.discountMinor, bill.subtotalMinor);

    const existing = (
      await db.query(`SELECT * FROM cashier_invoices WHERE tenant_id = $1 AND order_id = $2 LIMIT 1`, [
        tenantId,
        orderId
      ])
    ).rows[0];
    if (existing) {
      // Keep open invoices aligned with the latest order totals (tax/discount/item edits).
      if (["UNPAID", "PARTIALLY_PAID", "PENDING_APPROVAL"].includes(String(existing.status))) {
        const taxRate = resolveTaxRatePercent(bill.taxRatePercent);
        const taxable = Math.max(0, bill.subtotalMinor - bill.discountMinor);
        const taxTotal = Math.round((taxable * taxRate) / 100);
        const half = Math.floor(taxTotal / 2);
        const interstate = Boolean(opts?.interstate) || Number(existing.igst_minor) > 0;
        const net = taxable + taxTotal;
        const paid = Number(existing.paid_amount_minor);
        const due = Math.max(0, net - paid);
        const discountPercent =
          bill.subtotalMinor > 0 ? Math.round((bill.discountMinor / bill.subtotalMinor) * 10000) / 100 : 0;
        await db.query(
          `UPDATE cashier_invoices
           SET subtotal_minor = $3,
               discount_minor = $4,
               discount_percent = $5,
               taxable_minor = $6,
               cgst_minor = $7,
               sgst_minor = $8,
               igst_minor = $9,
               tax_rate_percent = $10,
               net_amount_minor = $11,
               due_amount_minor = $12,
               updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [
            existing.id,
            tenantId,
            bill.subtotalMinor,
            bill.discountMinor,
            discountPercent,
            taxable,
            interstate ? 0 : half,
            interstate ? 0 : taxTotal - half,
            interstate ? taxTotal : 0,
            taxRate,
            net,
            due
          ]
        );
        const refreshed = (
          await db.query(`SELECT * FROM cashier_invoices WHERE id = $1`, [existing.id])
        ).rows[0];
        return { bill: { ...bill, invoice: mapInvoice(refreshed) }, invoice: mapInvoice(refreshed) };
      }
      return { bill: { ...bill, invoice: mapInvoice(existing) }, invoice: mapInvoice(existing) };
    }

    const taxRate = resolveTaxRatePercent(bill.taxRatePercent);
    const taxable = Math.max(0, bill.subtotalMinor - bill.discountMinor);
    const taxTotal = Math.round((taxable * taxRate) / 100);
    const half = Math.floor(taxTotal / 2);
    const interstate = Boolean(opts?.interstate);
    const cgst = interstate ? 0 : half;
    const sgst = interstate ? 0 : taxTotal - half;
    const igst = interstate ? taxTotal : 0;
    const discountPercent =
      bill.subtotalMinor > 0 ? Math.round((bill.discountMinor / bill.subtotalMinor) * 10000) / 100 : 0;

    const count = (
      await db.query(`SELECT COUNT(*)::int AS c FROM cashier_invoices WHERE tenant_id = $1`, [tenantId])
    ).rows[0]?.c as number;
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const invoiceNumber = `INV-${day}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const id = randomUUID();
    const net = taxable + taxTotal;

    await db.query(
      `INSERT INTO cashier_invoices (
         id, tenant_id, order_id, invoice_number, patient_id, patient_name, patient_gstin,
         subtotal_minor, discount_minor, discount_percent, taxable_minor,
         cgst_minor, sgst_minor, igst_minor, tax_rate_percent, net_amount_minor,
         paid_amount_minor, due_amount_minor, status, discount_authorized_by, discount_authorizer_role,
         created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,$16,'UNPAID',$17,$18,$19)`,
      [
        id,
        tenantId,
        orderId,
        invoiceNumber,
        bill.patientId,
        bill.patientName,
        opts?.patientGstin ?? null,
        bill.subtotalMinor,
        bill.discountMinor,
        discountPercent,
        taxable,
        cgst,
        sgst,
        igst,
        taxRate,
        net,
        userId,
        role,
        userId
      ]
    );

    await db.query(`UPDATE order_bookings SET invoice_id = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      orderId,
      id
    ]);

    let invoice = mapInvoice(
      (await db.query(`SELECT * FROM cashier_invoices WHERE id = $1`, [id])).rows[0]
    );
    const freshBill = await loadBill(tenantId, orderId);
    const filePath = await renderTaxInvoicePdf(tenantId, freshBill, invoice);
    await db.query(`UPDATE cashier_invoices SET file_path = $2, updated_at = NOW() WHERE id = $1`, [id, filePath]);
    invoice = { ...invoice, filePath };

    return { bill: freshBill, invoice };
  },

  async collectPayment(
    tenantId: string,
    userId: string,
    role: UserRole,
    input: CollectPaymentInput
  ): Promise<{ bill: OrderBill; payment: CashierPayment; invoice: CashierInvoice }> {
    ensurePg();
    if (input.amountMinor <= 0) {
      throw new AppError("amountMinor must be positive", HTTP_STATUS.BAD_REQUEST, "AMOUNT_REQUIRED");
    }
    if (input.method === "TPA" && !input.tpaInsurer?.trim()) {
      throw new AppError("TPA insurer required", HTTP_STATUS.BAD_REQUEST, "TPA_INSURER_REQUIRED");
    }

    let invRow = (
      await db.query(`SELECT * FROM cashier_invoices WHERE tenant_id = $1 AND order_id = $2 LIMIT 1`, [
        tenantId,
        input.orderId
      ])
    ).rows[0];
    if (!invRow) {
      const created = await this.createTaxInvoice(tenantId, userId, role, input.orderId);
      invRow = (
        await db.query(`SELECT * FROM cashier_invoices WHERE id = $1`, [created.invoice.id])
      ).rows[0];
    }

    if (invRow.status === "PENDING_APPROVAL" || invRow.discount_status === "PENDING_APPROVAL") {
      throw new AppError(
        "Discount pending Lab Manager approval — payment blocked",
        HTTP_STATUS.CONFLICT,
        "DISCOUNT_PENDING_APPROVAL"
      );
    }

    const due = Number(invRow.due_amount_minor);
    if (due <= 0 || invRow.status === "PAID") {
      throw new AppError("Invoice is already fully paid", HTTP_STATUS.CONFLICT, "ALREADY_PAID");
    }
    // Allow 1-paise float/round drift; never accept a real overpay.
    let amountMinor = input.amountMinor;
    if (amountMinor > due) {
      if (amountMinor <= due + 1) {
        amountMinor = due;
      } else {
        throw new AppError("Payment exceeds due amount", HTTP_STATUS.BAD_REQUEST, "OVERPAY");
      }
    }

    const paymentId = randomUUID();
    await db.query(
      `INSERT INTO cashier_payments
       (id, tenant_id, invoice_id, order_id, amount_minor, method, tpa_insurer, tpa_claim_id, transaction_reference, status, collected_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUCCESS',$10)`,
      [
        paymentId,
        tenantId,
        invRow.id,
        input.orderId,
        amountMinor,
        input.method,
        input.tpaInsurer ?? null,
        input.tpaClaimId ?? null,
        input.transactionReference ?? null,
        userId
      ]
    );

    const paid = Number(invRow.paid_amount_minor) + amountMinor;
    const newDue = Number(invRow.net_amount_minor) - paid;
    const status = newDue <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
    await db.query(
      `UPDATE cashier_invoices
       SET paid_amount_minor = $2, due_amount_minor = $3, status = $4, updated_at = NOW()
       WHERE id = $1`,
      [invRow.id, paid, Math.max(0, newDue), status]
    );
    await db.query(
      `UPDATE order_bookings SET payment_status = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.orderId, status]
    );

    const payment = mapPayment(
      (await db.query(`SELECT * FROM cashier_payments WHERE id = $1`, [paymentId])).rows[0]
    );
    const invoice = mapInvoice((await db.query(`SELECT * FROM cashier_invoices WHERE id = $1`, [invRow.id])).rows[0]);
    const paidBill = await loadBill(tenantId, input.orderId);
    const filePath = await renderTaxInvoicePdf(tenantId, paidBill, invoice);
    await db.query(`UPDATE cashier_invoices SET file_path = $2, updated_at = NOW() WHERE id = $1`, [
      invRow.id,
      filePath
    ]);
    return { bill: paidBill, payment, invoice: { ...invoice, filePath } };
  },

  async listPayments(tenantId: string, orderId: string): Promise<CashierPayment[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM cashier_payments WHERE tenant_id = $1 AND order_id = $2 ORDER BY created_at DESC`,
      [tenantId, orderId]
    );
    return result.rows.map(mapPayment);
  },

  async listInvoices(
    tenantId: string,
    opts?: { q?: string; status?: string; limit?: number }
  ): Promise<InvoiceListItem[]> {
    ensurePg();
    const q = opts?.q?.trim() ?? "";
    const status = opts?.status?.trim().toUpperCase() ?? "";
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
    const params: unknown[] = [tenantId];
    const filters: string[] = ["ci.tenant_id = $1"];

    if (status) {
      params.push(status);
      filters.push(`ci.status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      filters.push(
        `(LOWER(ci.patient_name) LIKE $${params.length}
          OR LOWER(ci.invoice_number) LIKE $${params.length}
          OR LOWER(o.order_number) LIKE $${params.length}
          OR COALESCE(LOWER(p.phone), '') LIKE $${params.length})`
      );
    }
    params.push(limit);

    const result = await db.query(
      `SELECT ci.id AS invoice_id, ci.invoice_number, ci.order_id, o.order_number,
              ci.patient_id, ci.patient_name, p.phone AS patient_phone,
              ci.status, COALESCE(o.payment_status, ci.status) AS payment_status,
              ci.subtotal_minor, ci.discount_minor, ci.tax_rate_percent,
              ci.net_amount_minor, ci.paid_amount_minor, ci.due_amount_minor, ci.created_at
       FROM cashier_invoices ci
       JOIN order_bookings o ON o.id = ci.order_id AND o.tenant_id = ci.tenant_id
       LEFT JOIN patients p ON p.id = ci.patient_id
       WHERE ${filters.join(" AND ")}
       ORDER BY ci.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      invoiceId: String(r.invoice_id),
      invoiceNumber: String(r.invoice_number),
      orderId: String(r.order_id),
      orderNumber: String(r.order_number),
      patientId: String(r.patient_id),
      patientName: String(r.patient_name),
      patientPhone: (r.patient_phone as string | null) ?? null,
      status: String(r.status),
      paymentStatus: String(r.payment_status),
      subtotalMinor: Number(r.subtotal_minor),
      discountMinor: Number(r.discount_minor),
      taxRatePercent: Number(r.tax_rate_percent),
      netAmountMinor: Number(r.net_amount_minor),
      paidAmountMinor: Number(r.paid_amount_minor),
      dueAmountMinor: Number(r.due_amount_minor),
      createdAt: new Date(String(r.created_at)).toISOString()
    }));
  },

  async getInvoicePdfPath(tenantId: string, orderId: string): Promise<{ filePath: string; fileName: string }> {
    ensurePg();
    const bill = await loadBill(tenantId, orderId);
    if (!bill.invoice) {
      throw new AppError("Tax invoice PDF not found — generate invoice first", HTTP_STATUS.NOT_FOUND, "INVOICE_PDF_MISSING");
    }
    const filePath = await renderTaxInvoicePdf(tenantId, bill, bill.invoice);
    await db.query(`UPDATE cashier_invoices SET file_path = $2, updated_at = NOW() WHERE id = $1`, [
      bill.invoice.id,
      filePath
    ]);
    return { filePath, fileName: `${bill.invoice.invoiceNumber}.pdf` };
  }
};
