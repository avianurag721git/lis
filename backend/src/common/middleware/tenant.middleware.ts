import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { JwtPayload } from "../../modules/auth/auth.types";
import { saasTenantRepository } from "../../modules/saas/saasTenant.repository";
import { tenantRepository } from "../../modules/tenant/tenant.repository";
import { AppError } from "../errors/AppError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { setActiveTenantId, runWithTenant } from "../context/tenantContext";
import { logger } from "../logger/logger";

const extractSubdomain = (host: string, rootDomain: string): string | null => {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname || hostname === rootDomain) {
    return null;
  }
  const root = rootDomain.toLowerCase();
  if (hostname === `www.${root}`) {
    return null;
  }
  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (sub && !sub.includes(".")) {
      return sub;
    }
  }
  return null;
};

const resolveTenantFromHost = async (host: string): Promise<string | null> => {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname) {
    return null;
  }

  const byDomain = await saasTenantRepository.findByCustomDomain(hostname);
  if (byDomain) {
    return byDomain.id;
  }

  const root = env.saasRootDomain.toLowerCase();
  const sub = extractSubdomain(host, root);
  if (!sub || env.saasIgnoredSubdomains.includes(sub)) {
    return null;
  }

  const pgRow = await saasTenantRepository.findBySubdomain(sub);
  if (pgRow) {
    return pgRow.id;
  }
  const mem = tenantRepository.findBySubdomain(sub);
  return mem?.id ?? null;
};

/**
 * Resolves tenant from `x-tenant-id` header, JWT Bearer token, or request subdomain/custom domain.
 * Sets AsyncLocalStorage tenant context for Mongoose query middleware scoping.
 */
export const tenantContext = (req: Request, _res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      let tenantId: string | undefined;

      const headerTenant = req.header("x-tenant-id")?.trim();
      if (headerTenant) {
        tenantId = headerTenant;
      } else {
        const host = req.get("host") ?? "";
        const fromHost = await resolveTenantFromHost(host);
        if (fromHost) {
          tenantId = fromHost;
          logger.debug({ host, tenantId }, "tenant resolved from host");
        }
      }

      if (!tenantId) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.slice("Bearer ".length);
          try {
            const payload = jwt.verify(token, env.jwtAccessSecret) as JwtPayload;
            tenantId = payload.tenantId;
          } catch {
            /* token invalid — handled by auth middleware */
          }
        }
      }

      if (tenantId) {
        req.tenantId = tenantId;
        setActiveTenantId(tenantId);

        const tenantRow = await saasTenantRepository.findById(tenantId);
        if (tenantRow?.subscriptionStatus === "SUSPENDED" || tenantRow?.subscriptionStatus === "CANCELED") {
          const isPublicOnboard =
            req.path.startsWith("/saas-admin") || req.path.startsWith("/tenants") || req.path.startsWith("/auth");
          if (!isPublicOnboard) {
            next(
              new AppError(
                "Tenant subscription is suspended. Contact support.",
                HTTP_STATUS.FORBIDDEN,
                "TENANT_SUSPENDED"
              )
            );
            return;
          }
        }
        runWithTenant(tenantId, () => next());
        return;
      }

      next();
    } catch (err) {
      next(err as Error);
    }
  })();
};

export const requireTenant = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.tenantId) {
    next(new AppError("Tenant header or token is required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED"));
    return;
  }
  next();
};

/** Alias for monorepo path `apps/api/src/middlewares/tenantMiddleware.ts` */
export const tenantMiddleware = tenantContext;
