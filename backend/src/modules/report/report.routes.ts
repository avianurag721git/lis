import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { reportDownloadRateLimiter } from "../../common/middleware/rateLimit.middleware";
import {
  downloadReport,
  evaluateReportParameters,
  generateReport,
  getActiveReportTemplateForPatient,
  getReportStatus
} from "./report.controller";
import { generateReportSchema } from "./report.validation";
import { activeTemplateQuerySchema, evaluateReportParametersSchema } from "./reportTemplates.validation";

const reportRouter = Router();

reportRouter.post("/", authenticate, requireTenant, validate(generateReportSchema), generateReport);
reportRouter.get(
  "/templates/active",
  authenticate,
  requireTenant,
  validate(activeTemplateQuerySchema),
  getActiveReportTemplateForPatient
);
reportRouter.post(
  "/evaluate",
  authenticate,
  requireTenant,
  validate(evaluateReportParametersSchema),
  evaluateReportParameters
);
reportRouter.get("/:reportId/status", authenticate, requireTenant, getReportStatus);
reportRouter.get(
  "/:reportId/download",
  reportDownloadRateLimiter,
  authenticate,
  requireTenant,
  downloadReport
);

export { reportRouter };
