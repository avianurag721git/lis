import express, { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  bulkUpload,
  confirmRecharge,
  createB2BOrder,
  createRecharge,
  getFranchisee,
  getLedger,
  getRateCard,
  listFranchisees,
  listWallet,
  setRateCard,
  upsertFranchisee,
  walletWebhook
} from "./b2b.controller";

const franchiseeIdParam = z.object({ params: z.object({ franchiseeId: z.string().uuid() }) });

const upsertSchema = z.object({
  body: z.object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(2).max(40),
    name: z.string().trim().min(2).max(120),
    contactName: z.string().max(120).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    email: z.string().email().optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    creditLimitMinor: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
});

const pricesSchema = z.object({
  params: z.object({ franchiseeId: z.string().uuid() }),
  body: z.object({
    tests: z.array(z.object({ testId: z.string().uuid(), priceMinor: z.number().int().min(0) })).optional(),
    packages: z.array(z.object({ packageId: z.string().uuid(), priceMinor: z.number().int().min(0) })).optional()
  })
});

const rechargeSchema = z.object({
  params: z.object({ franchiseeId: z.string().uuid() }),
  body: z.object({
    amountMinor: z.number().int().positive(),
    gateway: z.enum(["STRIPE", "RAZORPAY"]).optional()
  })
});

const rechargeBodySchema = z.object({
  body: z.object({
    franchiseeId: z.string().uuid(),
    amountMinor: z.number().int().positive(),
    gateway: z.enum(["STRIPE", "RAZORPAY"]).optional()
  })
});

const confirmSchema = z.object({
  params: z.object({ franchiseeId: z.string().uuid() }),
  body: z.object({
    amountMinor: z.number().int().positive(),
    gateway: z.enum(["STRIPE", "RAZORPAY"]),
    gatewayRef: z.string().min(3).max(120)
  })
});

const bulkSchema = z.object({
  params: z.object({ franchiseeId: z.string().uuid() }),
  body: z.object({
    csv: z.string().min(10).max(2_000_000)
  })
});

const bulkUploadSchema = z.object({
  body: z.object({
    franchiseeId: z.string().uuid(),
    csv: z.string().min(10).max(2_000_000)
  })
});

const createOrderSchema = z.object({
  body: z.object({
    franchiseeId: z.string().uuid(),
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
      .min(1),
    referredDoctor: z.string().max(120).optional().nullable()
  })
});

const ledgerSchema = z.object({
  params: z.object({ franchiseeId: z.string().uuid() }),
  query: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      format: z.enum(["json", "csv", "pdf"]).optional()
    })
    .optional()
});

const b2bRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

b2bRouter.get("/franchisees", ...authed, requirePermission("B2B_WALLET_MANAGE"), listFranchisees);
b2bRouter.post("/franchisees", ...authed, requirePermission("B2B_WALLET_MANAGE"), validate(upsertSchema), upsertFranchisee);
b2bRouter.get("/franchisees/:franchiseeId", ...authed, requirePermission("B2B_WALLET_MANAGE"), validate(franchiseeIdParam), getFranchisee);
b2bRouter.get(
  "/franchisees/:franchiseeId/rate-card",
  ...authed,
  requirePermission("B2B_WALLET_MANAGE"),
  validate(franchiseeIdParam),
  getRateCard
);
b2bRouter.put("/franchisees/:franchiseeId/rate-card", ...authed, requirePermission("B2B_WALLET_MANAGE"), validate(pricesSchema), setRateCard);
b2bRouter.get(
  "/franchisees/:franchiseeId/wallet",
  ...authed,
  requirePermission("B2B_WALLET_MANAGE"),
  validate(franchiseeIdParam),
  listWallet
);
b2bRouter.post(
  "/franchisees/:franchiseeId/wallet/recharge",
  ...authed,
  requirePermission("B2B_WALLET_MANAGE"),
  validate(rechargeSchema),
  createRecharge
);
b2bRouter.post(
  "/franchisees/:franchiseeId/wallet/confirm",
  ...authed,
  requirePermission("B2B_WALLET_MANAGE"),
  validate(confirmSchema),
  confirmRecharge
);
b2bRouter.post(
  "/franchisees/:franchiseeId/bulk-orders",
  ...authed,
  requirePermission("B2B_WALLET_MANAGE"),
  validate(bulkSchema),
  bulkUpload
);

b2bRouter.post("/orders/create", ...authed, requirePermission("B2B_WALLET_MANAGE", "ORDER_CREATE"), validate(createOrderSchema), createB2BOrder);
b2bRouter.post("/orders/bulk-upload", ...authed, requirePermission("B2B_WALLET_MANAGE"), validate(bulkUploadSchema), bulkUpload);
b2bRouter.post("/wallet/recharge", ...authed, requirePermission("B2B_WALLET_MANAGE"), validate(rechargeBodySchema), createRecharge);
b2bRouter.get("/ledger/:franchiseeId", ...authed, requirePermission("B2B_WALLET_MANAGE"), validate(ledgerSchema), getLedger);

/** Raw-body webhook (mounted before express.json in app.ts). */
const b2bWalletWebhookRouter = Router();
b2bWalletWebhookRouter.post("/webhook", express.raw({ type: "application/json" }), walletWebhook);

export { b2bRouter, b2bWalletWebhookRouter };
