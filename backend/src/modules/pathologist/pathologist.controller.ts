import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { pathologistService } from "./pathologist.service";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const getReviewQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const results = await pathologistService.reviewQueue(req.tenantId);
    ok(res, { results });
  } catch (err) {
    next(err);
  }
};

export const verifySingle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const data = await pathologistService.verifySingle(req.tenantId, req.authUser.userId, req.body);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const verifyBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const data = await pathologistService.verifyBatch(req.tenantId, req.authUser.userId, req.body);
    ok(res, data);
  } catch (err) {
    next(err);
  }
};

export const rejectRerun = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await pathologistService.rejectRerun(req.tenantId, req.authUser.userId, req.body);
    ok(res, { result });
  } catch (err) {
    next(err);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const profile = await pathologistService.getProfile(req.tenantId, req.authUser.userId);
    ok(res, { profile });
  } catch (err) {
    next(err);
  }
};

export const putProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const profile = await pathologistService.upsertProfile(req.tenantId, req.authUser.userId, req.body);
    ok(res, { profile });
  } catch (err) {
    next(err);
  }
};
