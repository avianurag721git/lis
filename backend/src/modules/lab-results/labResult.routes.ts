import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  batchVerifyLabResults,
  getPathologistProfile,
  listPathologistQueue,
  listPendingLabResults,
  requestRerunLabResult,
  saveDraftLabResult,
  technicianApproveLabResult,
  upsertPathologistProfile
} from "./labResult.controller";
import {
  batchVerifySchema,
  pathologistProfileSchema,
  pendingQuerySchema,
  rerunSchema,
  saveDraftSchema
} from "./labResult.validation";

const labResultsRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

labResultsRouter.get(
  "/pending",
  ...authed,
  requirePermission("RESULT_ENTRY"),
  validate(pendingQuerySchema),
  listPendingLabResults
);
labResultsRouter.get("/pathologist-queue", ...authed, requirePermission("PATHOLOGIST_VERIFY"), listPathologistQueue);
labResultsRouter.get("/pathologist-profile", ...authed, requirePermission("PATHOLOGIST_VERIFY"), getPathologistProfile);
labResultsRouter.put(
  "/pathologist-profile",
  ...authed,
  requirePermission("PATHOLOGIST_VERIFY"),
  validate(pathologistProfileSchema),
  upsertPathologistProfile
);
labResultsRouter.post("/save-draft", ...authed, requirePermission("RESULT_ENTRY"), validate(saveDraftSchema), saveDraftLabResult);
labResultsRouter.post(
  "/technician-approve",
  ...authed,
  requirePermission("RESULT_ENTRY"),
  validate(saveDraftSchema),
  technicianApproveLabResult
);
labResultsRouter.post(
  "/batch-verify",
  ...authed,
  requirePermission("PATHOLOGIST_VERIFY"),
  validate(batchVerifySchema),
  batchVerifyLabResults
);
labResultsRouter.post(
  "/rerun-request",
  ...authed,
  requirePermission("PATHOLOGIST_VERIFY", "RESULT_ENTRY"),
  validate(rerunSchema),
  requestRerunLabResult
);

export { labResultsRouter };
