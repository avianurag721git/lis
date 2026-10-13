import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { authorize } from "../../common/middleware/rbac.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  checkSubdomainAvailability,
  createTenant,
  getOverview,
  getPublicBranding,
  listTenants,
  onboard,
  updateTenant
} from "./saasAdmin.controller";
import { createTenantAdminSchema, onboardSchema, publicBrandingSchema, updateTenantAdminSchema } from "./saasAdmin.validation";

const saasAdminRouter = Router();

/** Public onboarding & branding (no auth) */
saasAdminRouter.post("/onboard", validate(onboardSchema), onboard);
saasAdminRouter.get("/branding/:subdomain", validate(publicBrandingSchema), getPublicBranding);
saasAdminRouter.get("/subdomain-check", checkSubdomainAvailability);

/** Super Admin portal */
saasAdminRouter.get("/overview", authenticate, authorize("SUPER_ADMIN"), getOverview);
saasAdminRouter.get("/tenants", authenticate, authorize("SUPER_ADMIN"), listTenants);
saasAdminRouter.post("/tenants", authenticate, authorize("SUPER_ADMIN"), validate(createTenantAdminSchema), createTenant);
saasAdminRouter.patch(
  "/tenants/:tenantId",
  authenticate,
  authorize("SUPER_ADMIN"),
  validate(updateTenantAdminSchema),
  updateTenant
);

export { saasAdminRouter };
