import { Router } from "express";
import { validate } from "../../common/middleware/validate.middleware";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { createTenant, getTenantConfig, listLoginTenants, updateTenantConfig } from "./tenant.controller";
import { createTenantSchema, updateTenantConfigSchema } from "./tenant.validation";

const tenantRouter = Router();

tenantRouter.get("/", listLoginTenants);
tenantRouter.post("/", validate(createTenantSchema), createTenant);
tenantRouter.get("/config", authenticate, requireTenant, getTenantConfig);
tenantRouter.put("/config", authenticate, requireTenant, validate(updateTenantConfigSchema), updateTenantConfig);

export { tenantRouter };
