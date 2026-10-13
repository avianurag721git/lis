import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireFeature } from "../../common/middleware/feature.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  getDashboard,
  getExecutiveSummary,
  getLivePipeline,
  getReferralDoctors,
  getSampleRejections,
  getTatMetrics
} from "./analytics.controller";
import { dashboardQuerySchema } from "./analytics.validation";

const referralQuerySchema = z.object({
  query: z.object({
    from: z.string().min(8).max(40).optional(),
    to: z.string().min(8).max(40).optional(),
    doctor: z.string().max(120).optional()
  })
});

const analyticsRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant, requireFeature("analytics")] as const;

analyticsRouter.get("/dashboard", ...authed, requirePermission("ANALYTICS_VIEW"), validate(dashboardQuerySchema), getDashboard);
analyticsRouter.get(
  "/referral-doctors",
  ...authed,
  requirePermission("ANALYTICS_VIEW"),
  validate(referralQuerySchema),
  getReferralDoctors
);
analyticsRouter.get("/executive-summary", ...authed, requirePermission("ANALYTICS_VIEW"), getExecutiveSummary);
analyticsRouter.get("/tat-metrics", ...authed, requirePermission("ANALYTICS_VIEW"), getTatMetrics);
analyticsRouter.get("/sample-rejections", ...authed, requirePermission("ANALYTICS_VIEW"), getSampleRejections);
analyticsRouter.get("/live-pipeline", ...authed, requirePermission("ANALYTICS_VIEW"), getLivePipeline);

export { analyticsRouter };
