import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { authorize } from "../../common/middleware/rbac.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  getRoleDefaultsHandler,
  listTenantUsersHandler,
  patchUserPermissionsHandler
} from "./users.controller";
import { patchUserPermissionsSchema, roleDefaultsParamsSchema } from "./users.validation";

const usersRouter = Router();
const tenantAdmin = authorize("LAB_MANAGER", "TENANT_ADMIN", "SUPER_ADMIN");

usersRouter.get("/profile", authenticate, attachUserPermissions, (req, res) => {
  res.status(200).json({ profile: req.authUser });
});

usersRouter.get("/", authenticate, attachUserPermissions, requireTenant, tenantAdmin, listTenantUsersHandler);
usersRouter.get(
  "/role-defaults/:role",
  authenticate,
  attachUserPermissions,
  requireTenant,
  tenantAdmin,
  validate(roleDefaultsParamsSchema),
  getRoleDefaultsHandler
);
usersRouter.patch(
  "/:userId/permissions",
  authenticate,
  attachUserPermissions,
  requireTenant,
  tenantAdmin,
  requirePermission("SETTINGS_MANAGE"),
  validate(patchUserPermissionsSchema),
  patchUserPermissionsHandler
);

export { usersRouter };
