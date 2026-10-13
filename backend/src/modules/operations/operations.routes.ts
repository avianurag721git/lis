import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireFeature } from "../../common/middleware/feature.middleware";
import { auditTrail } from "../../common/middleware/audit.middleware";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { operationsService } from "./operations.service";

const operationsRouter = Router();
const authed = [authenticate, attachUserPermissions, requireFeature("operations_console")] as const;

operationsRouter.post(
  "/reports/generate",
  ...authed,
  requirePermission("SETTINGS_MANAGE"),
  auditTrail("REPORT_GENERATED", "Report"),
  async (req, res) => {
    const tenantId = req.tenantId ?? req.authUser?.tenantId;
    const userId = req.authUser?.userId;
    const result = await operationsService.triggerReportGeneration({
      ...(tenantId ? { tenantId } : {}),
      ...(userId ? { userId } : {})
    });
    res.status(HTTP_STATUS.OK).json(result);
  }
);

operationsRouter.post(
  "/payments/process",
  ...authed,
  requirePermission("SETTINGS_MANAGE"),
  auditTrail("PAYMENT_ACTION", "Payment"),
  async (_req, res) => {
    const result = await operationsService.triggerPaymentProcess();
    res.status(HTTP_STATUS.OK).json(result);
  }
);

operationsRouter.get(
  "/status",
  ...authed,
  requirePermission("SETTINGS_MANAGE"),
  async (_req, res) => {
    const status = await operationsService.getOperationsStatus();
    res.status(HTTP_STATUS.OK).json(status);
  }
);

export { operationsRouter };
