import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  createPurchaseOrder,
  createReagent,
  getLeveyJennings,
  listControls,
  listInstruments,
  listPurchaseOrders,
  listQcHolds,
  listReagents,
  recordControl,
  resolveQcHold,
  updateReagent
} from "./inventory.controller";

const controlLevelEnum = z.enum([
  "NORMAL",
  "HIGH",
  "LEVEL_1_NORMAL",
  "LEVEL_2_HIGH",
  "LEVEL_3_LOW"
]);

const createReagentSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    lotNumber: z.string().trim().min(1).max(80),
    expiryDate: z.string().min(8).max(32),
    vialCapacity: z.number().int().positive(),
    testsPerVial: z.number().int().positive().optional(),
    remainingTests: z.number().int().min(0).optional(),
    reorderLevel: z.number().int().min(0).optional(),
    unitCostMinor: z.number().int().min(0).optional(),
    supplierName: z.string().max(120).optional().nullable(),
    branchId: z.string().max(80).optional().nullable(),
    testId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    instrumentCode: z.string().max(60).optional().nullable()
  })
});

const updateReagentSchema = z.object({
  params: z.object({ reagentId: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    expiryDate: z.string().min(8).max(32).optional(),
    vialCapacity: z.number().int().positive().optional(),
    testsPerVial: z.number().int().positive().optional(),
    remainingTests: z.number().int().min(0).optional(),
    reorderLevel: z.number().int().min(0).optional(),
    unitCostMinor: z.number().int().min(0).optional(),
    supplierName: z.string().max(120).optional().nullable(),
    branchId: z.string().max(80).optional().nullable(),
    testId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    instrumentCode: z.string().max(60).optional().nullable(),
    isActive: z.boolean().optional()
  })
});

const controlSchema = z.object({
  body: z.object({
    reagentId: z.string().uuid().optional().nullable(),
    testId: z.string().uuid().optional().nullable(),
    instrumentCode: z.string().max(60).optional().nullable(),
    controlLevel: controlLevelEnum,
    parameterName: z.string().trim().min(1).max(120),
    targetMean: z.number(),
    targetSd: z.number().positive(),
    observedValue: z.number(),
    runDate: z.string().optional()
  })
});

const ljQuerySchema = z.object({
  query: z.object({
    parameterName: z.string().min(1).max(120),
    controlLevel: controlLevelEnum.optional()
  })
});

const holdParamSchema = z.object({
  params: z.object({ holdId: z.string().uuid() }),
  body: z
    .object({
      calibrationPass: z.boolean().optional()
    })
    .optional()
    .default({})
});

const poSchema = z.object({
  body: z.object({
    reagentId: z.string().uuid().optional().nullable(),
    reagentName: z.string().trim().min(1).max(120),
    lotNumber: z.string().max(80).optional().nullable(),
    quantityVials: z.number().int().positive(),
    unitCostMinor: z.number().int().min(0).optional(),
    supplierName: z.string().max(120).optional().nullable(),
    notes: z.string().max(500).optional().nullable()
  })
});

const inventoryRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

inventoryRouter.get("/reagents", ...authed, requirePermission("REAGENT_MANAGE"), listReagents);
inventoryRouter.post("/reagents", ...authed, requirePermission("REAGENT_MANAGE"), validate(createReagentSchema), createReagent);
inventoryRouter.patch(
  "/reagents/:reagentId",
  ...authed,
  requirePermission("REAGENT_MANAGE"),
  validate(updateReagentSchema),
  updateReagent
);
inventoryRouter.get("/purchase-orders", ...authed, requirePermission("REAGENT_MANAGE"), listPurchaseOrders);
inventoryRouter.post("/purchase-orders", ...authed, requirePermission("REAGENT_MANAGE"), validate(poSchema), createPurchaseOrder);

inventoryRouter.get("/qc/controls", ...authed, requirePermission("QC_MANAGE"), listControls);
inventoryRouter.post("/qc/controls", ...authed, requirePermission("QC_MANAGE"), validate(controlSchema), recordControl);
inventoryRouter.get(
  "/qc/levey-jennings",
  ...authed,
  requirePermission("QC_MANAGE"),
  validate(ljQuerySchema),
  getLeveyJennings
);
inventoryRouter.get("/qc/holds", ...authed, requirePermission("QC_MANAGE"), listQcHolds);
inventoryRouter.post(
  "/qc/holds/:holdId/resolve",
  ...authed,
  requirePermission("QC_MANAGE"),
  validate(holdParamSchema),
  resolveQcHold
);
inventoryRouter.get("/qc/instruments", ...authed, requirePermission("QC_MANAGE"), listInstruments);

export { inventoryRouter };
