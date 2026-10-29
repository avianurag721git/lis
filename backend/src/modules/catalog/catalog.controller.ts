import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { catalogRepository } from "./catalog.repository";
import { evaluateFormula } from "../lab-results/formula.engine";
import { routeParam } from "../../common/http/routeParam";

export const listDepartments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const departments = await catalogRepository.listDepartments(req.tenantId);
    res.status(HTTP_STATUS.OK).json({ departments });
  } catch (err) {
    next(err);
  }
};

export const createDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const department = await catalogRepository.createDepartment(req.tenantId, req.body.name);
    res.status(HTTP_STATUS.CREATED).json({ department });
  } catch (err) {
    next(err);
  }
};

export const listTestsForDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const departmentId = routeParam(req.params.departmentId);
    if (!departmentId) {
      throw new AppError("departmentId is required", HTTP_STATUS.BAD_REQUEST, "DEPARTMENT_ID_REQUIRED");
    }
    const tests = await catalogRepository.listTestsForDepartment(req.tenantId, departmentId);
    res.status(HTTP_STATUS.OK).json({ tests });
  } catch (err) {
    next(err);
  }
};

export const createTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const departmentId = routeParam(req.params.departmentId);
    if (!departmentId) {
      throw new AppError("departmentId is required", HTTP_STATUS.BAD_REQUEST, "DEPARTMENT_ID_REQUIRED");
    }
    const test = await catalogRepository.createTest(req.tenantId, {
      departmentId,
      name: req.body.name,
      code: req.body.code ?? null
    });
    res.status(HTTP_STATUS.CREATED).json({ test });
  } catch (err) {
    next(err);
  }
};

export const listParametersForTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const testId = routeParam(req.params.testId);
    if (!testId) {
      throw new AppError("testId is required", HTTP_STATUS.BAD_REQUEST, "TEST_ID_REQUIRED");
    }
    const parameters = await catalogRepository.listParametersForTest(req.tenantId, testId);
    res.status(HTTP_STATUS.OK).json({ parameters });
  } catch (err) {
    next(err);
  }
};

export const listAllParameters = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const parameters = await catalogRepository.listAllParameters(req.tenantId);
    res.status(HTTP_STATUS.OK).json({ parameters });
  } catch (err) {
    next(err);
  }
};

export const createParameter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const parameter = await catalogRepository.createParameter(req.tenantId, req.body);
    res.status(HTTP_STATUS.CREATED).json({ parameter });
  } catch (err) {
    next(err);
  }
};

export const assignParameterToTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const testId = routeParam(req.params.testId);
    if (!testId) {
      throw new AppError("testId is required", HTTP_STATUS.BAD_REQUEST, "TEST_ID_REQUIRED");
    }
    await catalogRepository.assignParameterToTest(req.tenantId, {
      testId,
      parameterId: req.body.parameterId,
      sortIndex: req.body.sortIndex
    });
    res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const unassignParameterFromTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const testId = routeParam(req.params.testId);
    const parameterId = routeParam(req.params.parameterId);
    if (!testId) {
      throw new AppError("testId is required", HTTP_STATUS.BAD_REQUEST, "TEST_ID_REQUIRED");
    }
    if (!parameterId) {
      throw new AppError("parameterId is required", HTTP_STATUS.BAD_REQUEST, "PARAMETER_ID_REQUIRED");
    }
    await catalogRepository.unassignParameterFromTest(req.tenantId, { testId, parameterId });
    res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const listRangesForParameter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const parameterId = routeParam(req.params.parameterId);
    if (!parameterId) {
      throw new AppError("parameterId is required", HTTP_STATUS.BAD_REQUEST, "PARAMETER_ID_REQUIRED");
    }
    const ranges = await catalogRepository.listRangesForParameter(req.tenantId, parameterId);
    res.status(HTTP_STATUS.OK).json({ ranges });
  } catch (err) {
    next(err);
  }
};

export const replaceRangesForParameter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const parameterId = routeParam(req.params.parameterId);
    if (!parameterId) {
      throw new AppError("parameterId is required", HTTP_STATUS.BAD_REQUEST, "PARAMETER_ID_REQUIRED");
    }
    await catalogRepository.replaceRangesForParameter(req.tenantId, parameterId, req.body.rules);
    res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const getTestStudio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const testId = routeParam(req.params.testId) as string;
    const studio = await catalogRepository.getTestStudio(req.tenantId, testId);
    if (!studio) {
      throw new AppError("Test not found", HTTP_STATUS.NOT_FOUND, "TEST_NOT_FOUND");
    }
    res.status(HTTP_STATUS.OK).json({ studio });
  } catch (err) {
    next(err);
  }
};

export const createParameterForTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const testId = routeParam(req.params.testId) as string;
    const parameter = await catalogRepository.createParameterForTest(req.tenantId, testId, req.body);
    res.status(HTTP_STATUS.CREATED).json({ parameter });
  } catch (err) {
    next(err);
  }
};

export const saveParameterStudio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const parameterId = routeParam(req.params.parameterId) as string;
    const parameter = await catalogRepository.saveParameterStudio(req.tenantId, parameterId, req.body);
    res.status(HTTP_STATUS.OK).json({ parameter });
  } catch (err) {
    next(err);
  }
};

export const getParameterDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const parameterId = routeParam(req.params.parameterId) as string;
    const parameter = await catalogRepository.getParameterById(req.tenantId, parameterId);
    if (!parameter) {
      throw new AppError("Parameter not found", HTTP_STATUS.NOT_FOUND, "PARAMETER_NOT_FOUND");
    }
    const ranges = await catalogRepository.listRangesForParameter(req.tenantId, parameterId);
    res.status(HTTP_STATUS.OK).json({ parameter, ranges });
  } catch (err) {
    next(err);
  }
};

export const previewFormula = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = evaluateFormula(req.body.formula, req.body.values);
    res.status(HTTP_STATUS.OK).json({ result });
  } catch (err) {
    next(err);
  }
};

