import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { getAuditLogs, rejectAuditMutation } from "./audit.controller";
import { listAuditLogsSchema } from "./audit.validation";

const auditRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

auditRouter.get("/", ...authed, requirePermission("SETTINGS_MANAGE"), validate(listAuditLogsSchema), getAuditLogs);

auditRouter.post("/", rejectAuditMutation);
auditRouter.put("/", rejectAuditMutation);
auditRouter.patch("/", rejectAuditMutation);
auditRouter.delete("/", rejectAuditMutation);
auditRouter.post("/:id", rejectAuditMutation);
auditRouter.put("/:id", rejectAuditMutation);
auditRouter.patch("/:id", rejectAuditMutation);
auditRouter.delete("/:id", rejectAuditMutation);

export { auditRouter };
