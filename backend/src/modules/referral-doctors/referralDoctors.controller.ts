import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { referralDoctorsService } from "./referralDoctors.service";

const ok = <T>(res: Response, data: T): void => {
  res.status(HTTP_STATUS.OK).json({ success: true, data });
};

export const searchReferralDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const doctors = await referralDoctorsService.search(req.tenantId, q);
    ok(res, { doctors });
  } catch (err) {
    next(err);
  }
};

export const frequentReferralDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const doctors = await referralDoctorsService.frequent(req.tenantId, 5);
    ok(res, { doctors });
  } catch (err) {
    next(err);
  }
};

export const quickAddReferralDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const doctor = await referralDoctorsService.quickAdd(req.tenantId, req.body);
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { doctor } });
  } catch (err) {
    next(err);
  }
};
