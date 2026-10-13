import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { labResultService } from "./labResult.service";
import { emitLabResultApproved, emitLabResultPathologistVerified } from "../../realtime/sampleEvents";
import { nablPdfEngine } from "../pdf-engine/nablPdf.engine";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const listPendingLabResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const filters: { department?: string; orderId?: string } = {};
    if (typeof req.query.department === "string" && req.query.department) filters.department = req.query.department;
    if (typeof req.query.orderId === "string" && req.query.orderId) filters.orderId = req.query.orderId;
    const results = await labResultService.listPending(req.tenantId, filters);
    ok(res, { results });
  } catch (err) {
    next(err);
  }
};

export const saveDraftLabResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await labResultService.saveDraft(req.tenantId, req.authUser.userId, req.body);
    ok(res, { result });
  } catch (err) {
    next(err);
  }
};

export const technicianApproveLabResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await labResultService.technicianApprove(req.tenantId, req.authUser.userId, req.body);
    emitLabResultApproved(req.tenantId, result);
    ok(res, { result });
  } catch (err) {
    next(err);
  }
};

export const listPathologistQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const results = await labResultService.listPathologistQueue(req.tenantId);
    ok(res, { results });
  } catch (err) {
    next(err);
  }
};

export const getPathologistProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const profile = await labResultService.getPathologistProfile(req.tenantId, req.authUser.userId);
    ok(res, { profile });
  } catch (err) {
    next(err);
  }
};

export const upsertPathologistProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const profile = await labResultService.upsertPathologistProfile(req.tenantId, req.authUser.userId, req.body);
    ok(res, { profile });
  } catch (err) {
    next(err);
  }
};

export const batchVerifyLabResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const { verified, profile } = await labResultService.batchVerify(req.tenantId, req.authUser.userId, req.body);
    emitLabResultPathologistVerified(req.tenantId, verified);

    const orderIds = [...new Set(verified.map((v) => v.orderId))];
    const reports: Array<{ orderId: string; reportUrl: string; verifyUrl: string }> = [];
    for (const orderId of orderIds) {
      const report = await nablPdfEngine.generateForOrder({
        tenantId: req.tenantId,
        userId: req.authUser.userId,
        orderId
      });
      reports.push({ orderId: report.orderId, reportUrl: report.reportUrl, verifyUrl: report.verifyUrl });
    }

    ok(res, { verified, profile, reports });
  } catch (err) {
    next(err);
  }
};

export const requestRerunLabResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await labResultService.requestRerun(req.tenantId, req.authUser.userId, req.body);
    ok(res, { result });
  } catch (err) {
    next(err);
  }
};
