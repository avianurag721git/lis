import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../../common/constants/httpStatus";
import { paymentService } from "../../application/payment.service";

const requireIdempotencyKey = (req: Request): string => {
  const key = req.header("Idempotency-Key");
  if (!key) {
    throw new AppError("Idempotency-Key header is required", HTTP_STATUS.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
};

export const postPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const { invoiceId, amount, method, transactionReference } = req.body as {
      invoiceId: string;
      amount: number;
      method: "CASH" | "UPI" | "CARD";
      transactionReference?: string;
    };
    const data = await paymentService.addPayment({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      invoiceId,
      amount,
      method,
      idempotencyKey,
      ...(transactionReference ? { transactionReference } : {})
    });
    res.status(HTTP_STATUS.CREATED).json(data);
  } catch (error) {
    next(error);
  }
};

export const postPaymentOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const { invoiceId, amount } = req.body as { invoiceId: string; amount: number };
    const data = await paymentService.createPaymentOrder({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      invoiceId,
      amount,
      idempotencyKey
    });
    res.status(HTTP_STATUS.CREATED).json(data);
  } catch (error) {
    next(error);
  }
};

export const postVerifyPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const { gatewayOrderId, paymentIntentId } = req.body as { gatewayOrderId: string; paymentIntentId: string };
    const result = await paymentService.verifyPayment({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      gatewayOrderId,
      paymentIntentId,
      idempotencyKey
    });
    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    next(error);
  }
};

export const paymentWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      throw new AppError("Missing stripe signature", HTTP_STATUS.BAD_REQUEST, "SIGNATURE_REQUIRED");
    }
    await paymentService.processWebhook(req.body as Buffer, signature);
    res.status(HTTP_STATUS.OK).json({ received: true });
  } catch (error) {
    next(error);
  }
};
