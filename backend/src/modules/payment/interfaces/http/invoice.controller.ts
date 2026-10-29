import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../../common/constants/httpStatus";
import { paymentService } from "../../application/payment.service";
import { routeParam } from "../../../../common/http/routeParam";

const requireIdempotencyKey = (req: Request): string => {
  const key = req.header("Idempotency-Key");
  if (!key) {
    throw new AppError("Idempotency-Key header is required", HTTP_STATUS.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
};

export const postInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const { patientId, totalAmount } = req.body as { patientId: string; totalAmount: number };
    const data = await paymentService.createInvoiceWithIdempotency(req.tenantId, patientId, totalAmount, idempotencyKey);
    res.status(HTTP_STATUS.CREATED).json(data);
  } catch (error) {
    next(error);
  }
};

export const getInvoiceById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const invoiceId = routeParam(req.params.id);
    if (!invoiceId) {
      throw new AppError("Invoice id is required", HTTP_STATUS.BAD_REQUEST, "INVOICE_REQUIRED");
    }
    const data = await paymentService.getInvoice(req.tenantId, invoiceId);
    res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    next(error);
  }
};

export const getInvoicePayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const invoiceId = routeParam(req.params.id);
    if (!invoiceId) {
      throw new AppError("Invoice id is required", HTTP_STATUS.BAD_REQUEST, "INVOICE_REQUIRED");
    }
    const data = await paymentService.getPaymentHistory(req.tenantId, invoiceId);
    res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    next(error);
  }
};
