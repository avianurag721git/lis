import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { patientsRepository } from "./patients.repository";
import { patientsLongitudinalService } from "./patientsLongitudinal.service";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const listPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const patients = await patientsRepository.list(req.tenantId, q);
    ok(res, { patients });
  } catch (err) {
    next(err);
  }
};

export const getLongitudinalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const patientId = req.params.patientId;
    if (!patientId) {
      throw new AppError("patientId is required", HTTP_STATUS.BAD_REQUEST, "PATIENT_ID_REQUIRED");
    }
    const history = await patientsLongitudinalService.getHistory(req.tenantId, patientId);
    ok(res, history);
  } catch (err) {
    next(err);
  }
};

export const getPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const patientId = req.params.patientId;
    if (!patientId) {
      throw new AppError("patientId is required", HTTP_STATUS.BAD_REQUEST, "PATIENT_ID_REQUIRED");
    }
    const reveal =
      req.authUser?.role === "SUPER_ADMIN" ||
      req.authUser?.role === "TENANT_ADMIN" ||
      req.authUser?.role === "MANAGER";
    const patient = await patientsRepository.getById(req.tenantId, patientId, reveal);
    if (!patient) {
      throw new AppError("Patient not found", HTTP_STATUS.NOT_FOUND, "PATIENT_NOT_FOUND");
    }
    ok(res, { patient });
  } catch (err) {
    next(err);
  }
};

/** Create or search patient by Mobile/UHID; auto-generate UHID if new. */
export const createOrSearchPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const result = await patientsRepository.createOrFind(req.tenantId, req.body);
    ok(res, result, result.created ? HTTP_STATUS.CREATED : HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const patient = await patientsRepository.create(req.tenantId, req.body);
    ok(res, { patient }, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const patientId = req.params.patientId;
    if (!patientId) {
      throw new AppError("patientId is required", HTTP_STATUS.BAD_REQUEST, "PATIENT_ID_REQUIRED");
    }
    const patient = await patientsRepository.update(req.tenantId, patientId, req.body);
    ok(res, { patient });
  } catch (err) {
    next(err);
  }
};
