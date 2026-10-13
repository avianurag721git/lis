import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import { z } from "zod";
import {
  createMagicLink,
  getMagicReport,
  kioskBook,
  kioskBookSchema,
  kioskCatalog,
  kioskConfirmPayment,
  kioskConfirmPaymentSchema,
  magicReportSchema
} from "./kiosk.controller";

const kioskPublicRouter = Router();
const kioskRouter = Router();

kioskPublicRouter.get("/catalog", kioskCatalog);
kioskPublicRouter.post("/book", kioskBookSchema, kioskBook);
kioskPublicRouter.post("/confirm-payment", kioskConfirmPaymentSchema, kioskConfirmPayment);
kioskPublicRouter.get("/magic-report/:token", magicReportSchema, getMagicReport);

kioskRouter.post(
  "/magic-link/:orderId",
  authenticate,
  requireTenant,
  validate(z.object({ params: z.object({ orderId: z.string().uuid() }) })),
  createMagicLink
);

export { kioskPublicRouter, kioskRouter };
