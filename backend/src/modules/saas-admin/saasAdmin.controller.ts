import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { saasAdminService } from "./saasAdmin.service";
import { saasTenantRepository } from "../saas/saasTenant.repository";
import { tenantRepository } from "../tenant/tenant.repository";
import { routeParam } from "../../common/http/routeParam";

export const getOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const overview = await saasAdminService.getOverview();
    res.status(HTTP_STATUS.OK).json({ overview });
  } catch (error) {
    next(error);
  }
};

export const listTenants = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenants = await saasAdminService.listTenants();
    res.status(HTTP_STATUS.OK).json({ tenants });
  } catch (error) {
    next(error);
  }
};

export const createTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await saasAdminService.createTenant(req.body);
    res.status(HTTP_STATUS.CREATED).json({ tenant });
  } catch (error) {
    next(error);
  }
};

export const updateTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = routeParam(req.params.tenantId) as string;
    await saasAdminService.updateTenant(tenantId, req.body);
    res.status(HTTP_STATUS.OK).json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const onboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await saasAdminService.onboard(req.body);
    res.status(HTTP_STATUS.CREATED).json(result);
  } catch (error) {
    next(error);
  }
};

/** Public endpoint for login/signup white-label bootstrap (no auth). */
export const getPublicBranding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const subdomain = (routeParam(req.params.subdomain) as string).toLowerCase();
    const row = await saasTenantRepository.findBySubdomain(subdomain);
    const mem = tenantRepository.findBySubdomain(subdomain);
    const source = row ?? mem;
    if (!source) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: "Tenant not found" });
      return;
    }
    const branding = row?.branding ?? row?.configuration.branding ?? mem?.configuration.branding;
    const config = row?.configuration ?? mem?.configuration;
    res.status(HTTP_STATUS.OK).json({
      tenantId: row?.id ?? mem?.id,
      name: row?.name ?? mem?.name,
      subdomain,
      branding: branding ?? {
        logoUrl: config?.logoUrl ?? null,
        primaryColor: "#0b5cab",
        secondaryColor: "#b91c1c",
        labHeaderAddress: "",
        nablRegNo: ""
      },
      brandingName: config?.brandingName ?? mem?.name ?? ""
    });
  } catch (error) {
    next(error);
  }
};

export const checkSubdomainAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const subdomain = String(req.query.subdomain ?? "").toLowerCase().trim();
    if (!subdomain) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ available: false });
      return;
    }
    const taken =
      Boolean(tenantRepository.findBySubdomain(subdomain)) ||
      Boolean(await saasTenantRepository.findBySubdomain(subdomain));
    res.status(HTTP_STATUS.OK).json({ available: !taken, subdomain });
  } catch (error) {
    next(error);
  }
};
