import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { reagentService } from "./reagent.service";
import { qcService } from "./qc.service";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const listReagents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const reagents = await reagentService.list(req.tenantId);
    ok(res, { reagents });
  } catch (err) {
    next(err);
  }
};

export const createReagent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const reagent = await reagentService.create(req.tenantId, req.body);
    ok(res, { reagent }, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const updateReagent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const reagent = await reagentService.update(req.tenantId, req.params.reagentId!, req.body);
    ok(res, { reagent });
  } catch (err) {
    next(err);
  }
};

export const listPurchaseOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const purchaseOrders = await reagentService.listPurchaseOrders(req.tenantId);
    ok(res, { purchaseOrders });
  } catch (err) {
    next(err);
  }
};

export const createPurchaseOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const purchaseOrder = await reagentService.createPurchaseOrder(req.tenantId, req.authUser.userId, req.body);
    ok(res, { purchaseOrder }, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const listControls = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const filters: { parameterName?: string; controlLevel?: string } = {};
    if (typeof req.query.parameterName === "string") filters.parameterName = req.query.parameterName;
    if (typeof req.query.controlLevel === "string") filters.controlLevel = req.query.controlLevel;
    const results = await qcService.listControls(req.tenantId, filters);
    ok(res, { results });
  } catch (err) {
    next(err);
  }
};

export const recordControl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const data = await qcService.recordControl(req.tenantId, req.authUser.userId, req.body);
    ok(res, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getLeveyJennings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const parameterName = String(req.query.parameterName ?? "");
    const controlLevel = String(req.query.controlLevel ?? "LEVEL_1_NORMAL");
    if (!parameterName) throw new AppError("parameterName required", HTTP_STATUS.BAD_REQUEST, "PARAM_REQUIRED");
    const chart = await qcService.getLeveyJennings(req.tenantId, parameterName, controlLevel);
    ok(res, { chart });
  } catch (err) {
    next(err);
  }
};

export const listQcHolds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const holds = await qcService.listActiveHolds(req.tenantId);
    ok(res, { holds });
  } catch (err) {
    next(err);
  }
};

export const resolveQcHold = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant required", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const calibrationPass = Boolean(req.body?.calibrationPass ?? true);
    const hold = await qcService.resolveHold(req.tenantId, req.authUser.userId, req.params.holdId!, {
      calibrationPass
    });
    ok(res, { hold });
  } catch (err) {
    next(err);
  }
};

export const listInstruments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    const instruments = await qcService.listInstruments(req.tenantId);
    ok(res, { instruments });
  } catch (err) {
    next(err);
  }
};
