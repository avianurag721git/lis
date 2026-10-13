import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { samplesService } from "../orders/orders.service";
import { emitOrderPipelineUpdate, emitSampleUpdated, emitLabResultQueueUpdate } from "../../realtime/sampleEvents";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const listSamples = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const samples = await samplesService.list(req.tenantId, status);
    ok(res, { samples });
  } catch (err) {
    next(err);
  }
};

export const collectSample = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const sample = await samplesService.collect(req.tenantId, req.authUser.userId, req.body);
    emitSampleUpdated(req.tenantId, sample);
    ok(res, { sample });
  } catch (err) {
    next(err);
  }
};

export const transitSample = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const sample = await samplesService.transit(req.tenantId, req.authUser.userId, req.body);
    emitSampleUpdated(req.tenantId, sample);
    ok(res, { sample });
  } catch (err) {
    next(err);
  }
};

export const receiveSample = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const sample = await samplesService.receive(req.tenantId, req.authUser.userId, req.body);
    emitSampleUpdated(req.tenantId, sample);
    ok(res, { sample });
  } catch (err) {
    next(err);
  }
};

export const rapidScanSample = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const result = await samplesService.rapidScan(req.tenantId, req.authUser.userId, req.body);
    emitSampleUpdated(req.tenantId, result.sample);
    emitOrderPipelineUpdate(req.tenantId, result.sample.orderId, result.pipeline);
    if (result.labResultsActivated > 0) {
      emitLabResultQueueUpdate(req.tenantId, {
        orderId: result.sample.orderId,
        activatedBy: req.authUser.userId,
        count: result.labResultsActivated
      });
    }
    ok(res, result);
  } catch (err) {
    next(err);
  }
};
