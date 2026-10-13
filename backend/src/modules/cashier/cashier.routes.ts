import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  adjustCashierBill,
  collectCashierPayment,
  createCashierInvoice,
  downloadCashierInvoice,
  getCashierBill,
  listCashierInvoices,
  listCashierPayments,
  listCashierQueue
} from "./cashier.controller";

const orderIdParam = z.object({ params: z.object({ orderId: z.string().uuid() }) });

const adjustSchema = z.object({
  params: z.object({ orderId: z.string().uuid() }),
  body: z.object({
    addItems: z
      .array(
        z.object({
          itemType: z.enum(["TEST", "PACKAGE"]),
          testId: z.string().uuid().optional(),
          packageId: z.string().uuid().optional(),
          quantity: z.number().int().min(1).max(20).optional()
        })
      )
      .optional(),
    removeItemIds: z.array(z.string().uuid()).optional(),
    discountMinor: z.number().int().min(0).optional(),
    taxRatePercent: z.number().min(0).max(40).optional(),
    referredDoctor: z.string().max(120).optional().nullable(),
    referralDoctorId: z.string().uuid().optional().nullable()
  })
});

const invoiceSchema = z.object({
  params: z.object({ orderId: z.string().uuid() }),
  body: z
    .object({
      patientGstin: z.string().max(20).optional().nullable(),
      interstate: z.boolean().optional()
    })
    .optional()
    .default({})
});

const paySchema = z.object({
  params: z.object({ orderId: z.string().uuid() }),
  body: z.object({
    amountMinor: z.number().int().positive(),
    method: z.enum(["CASH", "UPI", "CARD", "TPA", "ONLINE"]),
    tpaInsurer: z.string().max(120).optional().nullable(),
    tpaClaimId: z.string().max(80).optional().nullable(),
    transactionReference: z.string().max(120).optional().nullable()
  })
});

const cashierRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;
const billing = requirePermission("BILLING_CREATE");

cashierRouter.get("/queue", ...authed, billing, listCashierQueue);
cashierRouter.get("/invoices", ...authed, billing, listCashierInvoices);
cashierRouter.get("/orders/:orderId", ...authed, billing, validate(orderIdParam), getCashierBill);
cashierRouter.patch("/orders/:orderId", ...authed, billing, validate(adjustSchema), adjustCashierBill);
cashierRouter.post(
  "/orders/:orderId/invoice",
  ...authed,
  billing,
  validate(invoiceSchema),
  createCashierInvoice
);
cashierRouter.post("/orders/:orderId/pay", ...authed, billing, validate(paySchema), collectCashierPayment);
cashierRouter.get(
  "/orders/:orderId/payments",
  ...authed,
  billing,
  validate(orderIdParam),
  listCashierPayments
);
cashierRouter.get(
  "/orders/:orderId/invoice.pdf",
  ...authed,
  billing,
  validate(orderIdParam),
  downloadCashierInvoice
);

export { cashierRouter };
