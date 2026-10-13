import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { analyticsService } from "./analytics.service";
import { referralAnalyticsService } from "./referralAnalytics.service";
import { lisAnalyticsService } from "./lisAnalytics.service";

const ok = <T>(res: Response, data: T): void => {
  res.status(HTTP_STATUS.OK).json({ success: true, data });
};

export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const { from, to } = req.query as { from?: string; to?: string };
    const query: { from?: string; to?: string } = {};
    if (typeof from === "string") {
      query.from = from;
    }
    if (typeof to === "string") {
      query.to = to;
    }
    const data = await analyticsService.getDashboard(req.tenantId, query);
    res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    next(error);
  }
};

export const getReferralDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const opts: { from?: string; to?: string; doctor?: string } = {};
    if (typeof req.query.from === "string") opts.from = req.query.from;
    if (typeof req.query.to === "string") opts.to = req.query.to;
    if (typeof req.query.doctor === "string") opts.doctor = req.query.doctor;
    const data = await referralAnalyticsService.byDoctor(req.tenantId, opts);
    res.status(HTTP_STATUS.OK).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getExecutiveSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    ok(res, await lisAnalyticsService.executiveSummary(req.tenantId));
  } catch (error) {
    next(error);
  }
};

export const getTatMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    ok(res, await lisAnalyticsService.tatMetrics(req.tenantId));
  } catch (error) {
    next(error);
  }
};

export const getSampleRejections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    ok(res, await lisAnalyticsService.sampleRejections(req.tenantId));
  } catch (error) {
    next(error);
  }
};

export const getLivePipeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    ok(res, await lisAnalyticsService.livePipeline(req.tenantId));
  } catch (error) {
    next(error);
  }
};
