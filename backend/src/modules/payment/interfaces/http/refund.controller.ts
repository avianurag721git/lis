import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../../common/constants/httpStatus";
import { refundService } from "../../application/refund.service";

const requireIdempotencyKey = (req: Request): string => {
  const key = req.header("Idempotency-Key");
  if (!key) {
    throw new AppError("Idempotency-Key header is required", HTTP_STATUS.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
};

export const postRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const { transactionId, amount, reason } = req.body as {
      transactionId: string;
      amount: number;
      reason?: string;
    };
    const data = await refundService.createRefund({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      transactionId,
      amount,
      idempotencyKey,
      ...(reason !== undefined ? { reason } : {})
    });
    res.status(HTTP_STATUS.CREATED).json(data);
  } catch (error) {
    next(error);
  }
};

export const getRefundsByInvoiceId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const invoiceId = req.params.invoiceId;
    if (!invoiceId) {
      throw new AppError("Invoice id is required", HTTP_STATUS.BAD_REQUEST, "INVOICE_REQUIRED");
    }
    const data = await refundService.listRefundsForInvoice(req.tenantId, invoiceId);
    res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    next(error);
  }
};
