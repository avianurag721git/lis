import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { env } from "../../config/env";
import { validate } from "../../common/middleware/validate.middleware";
import { kioskService, smartReportService } from "./kiosk.service";
import { routeParam } from "../../common/http/routeParam";

const resolvePublicTenant = (req: Request): string => {
  const fromHeader = req.header("x-tenant-id")?.trim();
  const fromQuery = typeof req.query.tenant === "string" ? req.query.tenant.trim() : "";
  return fromHeader || fromQuery || req.tenantId || env.authSeedTenantId;
};

export const kioskCatalog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = resolvePublicTenant(req);
    const catalog = await kioskService.getCatalog(tenantId);
    res.status(HTTP_STATUS.OK).json({ success: true, data: catalog });
  } catch (err) {
    next(err);
  }
};

export const kioskBookSchema = validate(
  z.object({
    body: z.object({
      mobile: z.string().min(10).max(15),
      patientName: z.string().max(120).optional(),
      testIds: z.array(z.string().uuid()).min(1),
      paymentReference: z.string().max(80).optional()
    })
  })
);

export const kioskBook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = resolvePublicTenant(req);
    const result = await kioskService.bookAndToken(tenantId, req.body);
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const kioskConfirmPaymentSchema = validate(
  z.object({
    body: z.object({
      tokenId: z.string().uuid(),
      transactionReference: z.string().min(4).max(80)
    })
  })
);

export const kioskConfirmPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = resolvePublicTenant(req);
    const token = await kioskService.confirmPayment(tenantId, req.body.tokenId, req.body.transactionReference);
    res.status(HTTP_STATUS.OK).json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
};

export const magicReportSchema = validate(
  z.object({
    params: z.object({ token: z.string().min(4).max(16) })
  })
);

export const getMagicReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await smartReportService.resolveMagicLink(routeParam(req.params.token) as string);
    res.status(HTTP_STATUS.OK).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

export const createMagicLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const orderId = routeParam(req.params.orderId) as string;
    const link = await smartReportService.createMagicLink(req.tenantId, orderId);
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: link });
  } catch (err) {
    next(err);
  }
};
