import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { approveDiscount, createInvoice, queue } from "./billing.controller";

const paymentLine = z.object({
  amountMinor: z.number().int().positive(),
  method: z.enum(["CASH", "UPI", "CARD", "TPA", "ONLINE"]),
  tpaInsurer: z.string().max(120).optional().nullable(),
  tpaClaimId: z.string().max(80).optional().nullable(),
  transactionReference: z.string().max(120).optional().nullable()
});

const createInvoiceSchema = z.object({
  body: z
    .object({
      orderId: z.string().uuid().optional(),
      patientId: z.string().uuid().optional(),
      patient: z
        .object({
          name: z.string().min(1).max(120).optional(),
          phone: z.string().max(30).optional(),
          mobile: z.string().max(30).optional(),
          gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
          ageYears: z.number().int().min(0).max(130).nullable().optional()
        })
        .optional(),
      items: z
        .array(
          z.object({
            itemType: z.enum(["TEST", "PACKAGE"]),
            testId: z.string().uuid().optional(),
            packageId: z.string().uuid().optional(),
            quantity: z.number().int().min(1).max(20).optional()
          })
        )
        .optional(),
      discountMinor: z.number().int().min(0).optional(),
      taxRatePercent: z.number().min(0).max(40).optional(),
      taxExempt: z.boolean().optional(),
      referredDoctor: z.string().max(120).optional().nullable(),
      referralDoctorId: z.string().uuid().optional().nullable(),
      patientGstin: z.string().max(20).optional().nullable(),
      interstate: z.boolean().optional(),
      payments: z.array(paymentLine).max(10).optional()
    })
    .refine((b) => Boolean(b.orderId) || (b.items && b.items.length > 0), {
      message: "orderId or items required"
    })
});

const approveSchema = z.object({
  params: z.object({ orderId: z.string().uuid() })
});

const billingRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

billingRouter.get("/queue", ...authed, requirePermission("BILLING_CREATE"), queue);
billingRouter.post("/create-invoice", ...authed, requirePermission("BILLING_CREATE"), validate(createInvoiceSchema), createInvoice);
billingRouter.post(
  "/orders/:orderId/approve-discount",
  ...authed,
  requirePermission("DISCOUNT_APPROVE_HIGH", "BILLING_CREATE"),
  validate(approveSchema),
  approveDiscount
);

export { billingRouter };
