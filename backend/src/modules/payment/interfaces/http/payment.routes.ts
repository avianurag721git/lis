import express, { Router } from "express";
import { authenticate } from "../../../../common/middleware/auth.middleware";
import { requireTenant } from "../../../../common/middleware/tenant.middleware";
import { validate } from "../../../../common/middleware/validate.middleware";
import { paymentWebhook, postPayment, postPaymentOrder, postVerifyPayment } from "./payment.controller";
import { addPaymentSchema, createPaymentOrderSchema, verifyPaymentSchema } from "./payment.validation";

const paymentRouter = Router();
const paymentWebhookRouter = Router();

paymentRouter.post("/", authenticate, requireTenant, validate(addPaymentSchema), postPayment);
paymentRouter.post("/order", authenticate, requireTenant, validate(createPaymentOrderSchema), postPaymentOrder);
paymentRouter.post("/verify", authenticate, requireTenant, validate(verifyPaymentSchema), postVerifyPayment);

paymentWebhookRouter.post("/webhook", express.raw({ type: "application/json" }), paymentWebhook);

export { paymentRouter, paymentWebhookRouter };
