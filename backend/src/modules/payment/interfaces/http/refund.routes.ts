import { Router } from "express";
import { authenticate } from "../../../../common/middleware/auth.middleware";
import { requireFeature } from "../../../../common/middleware/feature.middleware";
import { requireTenant } from "../../../../common/middleware/tenant.middleware";
import { validate } from "../../../../common/middleware/validate.middleware";
import { getRefundsByInvoiceId, postRefund } from "./refund.controller";
import { createRefundBodySchema } from "./refund.validation";

const refundRouter = Router();

refundRouter.post("/", authenticate, requireTenant, requireFeature("refunds"), validate(createRefundBodySchema), postRefund);
refundRouter.get("/:invoiceId", authenticate, requireTenant, requireFeature("refunds"), getRefundsByInvoiceId);

export { refundRouter };
