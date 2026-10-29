import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { routeParam } from "../../common/http/routeParam";
import { reportService } from "./report.service";
import { tenantService } from "../tenant/tenant.service";
import { reportTemplatesService } from "./reportTemplates.service";
import { PatientGender, ReportTemplateType } from "./reportTemplates.types";

export const generateReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const result = await reportService.generate({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      ...req.body
    });
    res.status(HTTP_STATUS.CREATED).json(result);
  } catch (error) {
    next(error);
  }
};

export const getActiveReportTemplateForPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }

    const tenantConfig = await tenantService.resolveTenantConfiguration(tenantId);
    const templateType: ReportTemplateType = tenantConfig.reportTemplate;

    const patientGender = (req.query.patientGender as PatientGender | undefined) ?? "MALE";
    const patientAgeYearsRaw = req.query.patientAgeYears as unknown;
    const patientAgeYears = patientAgeYearsRaw == null ? 30 : Number(patientAgeYearsRaw);
    if (!Number.isFinite(patientAgeYears) || patientAgeYears < 0 || patientAgeYears > 120) {
      throw new AppError("patientAgeYears must be between 0 and 120", HTTP_STATUS.BAD_REQUEST, "INVALID_AGE");
    }

    const result = await reportTemplatesService.getActiveTemplateForPatient({
      tenantId,
      templateType,
      patientGender,
      patientAgeYears
    });

    res.status(HTTP_STATUS.OK).json({
      template: result.template,
      itemsWithReference: result.itemsWithReference
    });
  } catch (error) {
    next(error);
  }
};

export const evaluateReportParameters = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }

    const tenantConfig = await tenantService.resolveTenantConfiguration(tenantId);
    const templateType: ReportTemplateType =
      (req.body.templateType as ReportTemplateType | undefined) ?? tenantConfig.reportTemplate;

    const result = await reportTemplatesService.evaluateParametersForPatient({
      tenantId,
      templateType,
      patientGender: req.body.patientGender,
      patientAgeYears: req.body.patientAgeYears,
      parameterValues: req.body.parameterValues
    });

    res.status(HTTP_STATUS.OK).json({ evaluations: result });
  } catch (error) {
    next(error);
  }
};

export const downloadReport = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const reportId = routeParam(req.params.reportId);
    if (!reportId) {
      throw new AppError("Report id is required", HTTP_STATUS.BAD_REQUEST, "REPORT_ID_REQUIRED");
    }
    const file = reportService.getDownloadFile(req.tenantId, reportId);
    res.download(file.filePath, file.fileName);
  } catch (error) {
    next(error);
  }
};

export const getReportStatus = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const reportId = routeParam(req.params.reportId);
    if (!reportId) {
      throw new AppError("Report id is required", HTTP_STATUS.BAD_REQUEST, "REPORT_ID_REQUIRED");
    }
    const status = reportService.getStatus(req.tenantId, reportId);
    res.status(HTTP_STATUS.OK).json(status);
  } catch (error) {
    next(error);
  }
};
