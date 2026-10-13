import { NextFunction, Request, Response } from "express";
import { env } from "../../config/env";
import { logger } from "../logger/logger";
import { saasTenantRepository } from "../../modules/saas/saasTenant.repository";
import { tenantRepository } from "../../modules/tenant/tenant.repository";

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

/**
 * Resolves tenant from host when `Host` is `{subdomain}.{SAAS_ROOT_DOMAIN}`.
 * Skips when `x-tenant-id` is already present (header wins).
 * Does not override JWT tenant (applied later in tenantContext for Bearer tokens).
 */
export const subdomainTenantMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      const headerTenant = req.header("x-tenant-id")?.trim();
      if (headerTenant) {
        next();
        return;
      }

      const host = req.get("host") ?? "";
      const root = env.saasRootDomain.toLowerCase();
      const sub = extractSubdomain(host, root);

      if (!sub || env.saasIgnoredSubdomains.includes(sub)) {
        next();
        return;
      }

      let tenantId: string | null = null;
      const pgRow = await saasTenantRepository.findBySubdomain(sub);
      if (pgRow) {
        tenantId = pgRow.id;
      } else {
        const mem = tenantRepository.findBySubdomain(sub);
        tenantId = mem?.id ?? null;
      }

      if (tenantId) {
        req.tenantId = tenantId;
        logger.debug({ subdomain: sub, tenantId }, "tenant resolved from host");
      }
      next();
    } catch (err) {
      logger.error({ err }, "subdomain tenant resolution failed");
      next(err as Error);
    }
  })();
};
