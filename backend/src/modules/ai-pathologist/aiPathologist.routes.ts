import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { authorize } from "../../common/middleware/rbac.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { analyzeResult, patientSummary } from "./aiPathologist.controller";
import { analyzeResultSchema, patientSummarySchema } from "./aiPathologist.validation";

const aiPathologistRouter = Router();

/** AI Co-Pathologist — MANAGER+ and pathologist roles */
aiPathologistRouter.post(
  "/analyze-result",
  authenticate,
  requireTenant,
  authorize("MANAGER", "TENANT_ADMIN", "SUPER_ADMIN"),
  validate(analyzeResultSchema),
  analyzeResult
);

aiPathologistRouter.post(
  "/patient-summary",
  authenticate,
  requireTenant,
  authorize("MANAGER", "TENANT_ADMIN", "SUPER_ADMIN", "STAFF"),
  validate(patientSummarySchema),
  patientSummary
);

export { aiPathologistRouter };
