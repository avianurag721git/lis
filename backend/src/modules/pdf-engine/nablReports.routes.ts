import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { reportDownloadRateLimiter } from "../../common/middleware/rateLimit.middleware";
import {
  distributeOrderReport,
  downloadOrderReport,
  downloadPresignedReport,
  generateOrderReport,
  listMyReports,
  presignOrderReport,
  verifyOrderReport,
  viewReportByPasscode
} from "./nablReports.controller";

const orderIdParamSchema = z.object({
  params: z.object({
    orderId: z.string().uuid()
  })
});

const distributeSchema = z.object({
  params: z.object({
    orderId: z.string().uuid()
  }),
  body: z.object({
    channels: z.array(z.enum(["WHATSAPP", "SMS", "EMAIL", "WEBHOOK"])).optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().min(8).max(20).optional().nullable()
  })
});

const nablReportsRouter = Router();

nablReportsRouter.get("/my", authenticate, requireTenant, listMyReports);

nablReportsRouter.get(
  "/download/:orderId",
  reportDownloadRateLimiter,
  authenticate,
  requireTenant,
  validate(orderIdParamSchema),
  downloadOrderReport
);
nablReportsRouter.get(
  "/presign/:orderId",
  reportDownloadRateLimiter,
  authenticate,
  requireTenant,
  validate(orderIdParamSchema),
  presignOrderReport
);
nablReportsRouter.get(
  "/presigned/:token",
  reportDownloadRateLimiter,
  downloadPresignedReport
);
nablReportsRouter.post(
  "/generate/:orderId",
  authenticate,
  requireTenant,
  validate(orderIdParamSchema),
  generateOrderReport
);
nablReportsRouter.post(
  "/distribute/:orderId",
  authenticate,
  requireTenant,
  validate(distributeSchema),
  distributeOrderReport
);
nablReportsRouter.get("/verify/:orderId", validate(orderIdParamSchema), verifyOrderReport);
nablReportsRouter.get("/verify-public/:orderId", validate(orderIdParamSchema), verifyOrderReport);
nablReportsRouter.get(
  "/view/:passcode",
  validate(z.object({ params: z.object({ passcode: z.string().min(4).max(12) }) })),
  viewReportByPasscode
);

export { nablReportsRouter };
