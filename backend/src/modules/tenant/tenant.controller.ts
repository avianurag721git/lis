import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AppError } from "../../common/errors/AppError";
import { saasContextService } from "../saas/saasContext.service";
import { saasTenantRepository } from "../saas/saasTenant.repository";
import { auditService } from "../audit/audit.service";
import { tenantService } from "./tenant.service";

export const createTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await tenantService.createTenant(req.body);
    res.status(HTTP_STATUS.CREATED).json({ tenant });
  } catch (error) {
    next(error);
  }
};

export const listLoginTenants = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenants = await tenantService.listLoginTenants();
    res.status(HTTP_STATUS.OK).json({ tenants });
  } catch (error) {
    next(error);
  }
};

export const getTenantConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const payload = await saasContextService.buildTenantConfigResponse(req.tenantId);
    res.status(HTTP_STATUS.OK).json(payload);
  } catch (error) {
    next(error);
  }
};

export const updateTenantConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const role = req.authUser?.role;
    if (role !== "SUPER_ADMIN" && role !== "TENANT_ADMIN" && role !== "MANAGER") {
      throw new AppError("Only lab managers can update tenant configuration", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    }

    const body = req.body as {
      name?: string;
      brandingName?: string;
      logoUrl?: string | null;
      reportTemplate?: "STANDARD" | "DETAILED";
      branding?: Record<string, unknown>;
      settings?: Record<string, unknown>;
      finance?: Record<string, unknown>;
    };

    const logoUrl =
      body.logoUrl === "" || body.logoUrl === null
        ? null
        : typeof body.logoUrl === "string"
          ? body.logoUrl
          : undefined;

    const updated = await saasTenantRepository.updateConfiguration(req.tenantId, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.brandingName ? { brandingName: body.brandingName } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      ...(body.reportTemplate ? { reportTemplate: body.reportTemplate } : {}),
      ...(body.branding
        ? {
            branding: {
              ...(typeof body.branding.logoUrl === "string" || body.branding.logoUrl === null
                ? { logoUrl: body.branding.logoUrl === "" ? null : (body.branding.logoUrl as string | null) }
                : {}),
              ...(typeof body.branding.primaryColor === "string"
                ? { primaryColor: body.branding.primaryColor }
                : {}),
              ...(typeof body.branding.secondaryColor === "string"
                ? { secondaryColor: body.branding.secondaryColor }
                : {}),
              ...(typeof body.branding.labHeaderAddress === "string"
                ? { labHeaderAddress: body.branding.labHeaderAddress }
                : {}),
              ...(typeof body.branding.nablRegNo === "string" ? { nablRegNo: body.branding.nablRegNo } : {})
            }
          }
        : {}),
      ...(body.settings
        ? {
            settings: {
              ...(typeof body.settings.maxUsers === "number" ? { maxUsers: body.settings.maxUsers } : {}),
              ...(typeof body.settings.maxBranches === "number"
                ? { maxBranches: body.settings.maxBranches }
                : {}),
              ...(Array.isArray(body.settings.enabledModules)
                ? { enabledModules: body.settings.enabledModules as string[] }
                : {})
            }
          }
        : {}),
      ...(body.finance
        ? {
            finance: {
              ...(body.finance.defaultGstPercent !== undefined
                ? { defaultGstPercent: Number(body.finance.defaultGstPercent) }
                : {}),
              ...(typeof body.finance.labGstin === "string" ? { labGstin: body.finance.labGstin } : {}),
              ...(typeof body.finance.currencyCode === "string"
                ? { currencyCode: body.finance.currencyCode }
                : {}),
              ...(typeof body.finance.invoicePrefix === "string"
                ? { invoicePrefix: body.finance.invoicePrefix }
                : {}),
              ...(typeof body.finance.placeOfSupply === "string"
                ? { placeOfSupply: body.finance.placeOfSupply }
                : {})
            }
          }
        : {})
    });

    if (!updated) {
      throw new AppError("Tenant not found in SaaS registry", HTTP_STATUS.NOT_FOUND, "TENANT_NOT_FOUND");
    }

    auditService.log({
      userId: req.authUser?.userId ?? null,
      tenantId: req.tenantId,
      action: "UPDATE",
      entity: "TENANT_CONFIG",
      entityId: req.tenantId,
      metadata: {
        finance: updated.configuration.finance,
        brandingName: updated.configuration.brandingName
      }
    });

    const payload = await saasContextService.buildTenantConfigResponse(req.tenantId);
    res.status(HTTP_STATUS.OK).json(payload);
  } catch (error) {
    next(error);
  }
};
