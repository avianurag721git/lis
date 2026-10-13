import { Request } from "express";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { saasTenantRepository } from "./saasTenant.repository";
import { tenantRepository } from "../tenant/tenant.repository";

const extractSubdomain = (host: string, rootDomain: string): string | null => {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const root = rootDomain.toLowerCase();
  if (!hostname || hostname === root || hostname === `www.${root}`) {
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

export const assertJwtTenantMatchesHost = async (req: Request, jwtTenantId: string): Promise<void> => {
  const host = req.get("host") ?? "";
  const sub = extractSubdomain(host, env.saasRootDomain);
  if (!sub || env.saasIgnoredSubdomains.includes(sub)) {
    return;
  }
  let hostTenantId: string | null = null;
  const row = await saasTenantRepository.findBySubdomain(sub);
  if (row) {
    hostTenantId = row.id;
  } else {
    const mem = tenantRepository.findBySubdomain(sub);
    hostTenantId = mem?.id ?? null;
  }
  if (hostTenantId && hostTenantId !== jwtTenantId) {
    throw new AppError("Token tenant does not match host tenant", HTTP_STATUS.FORBIDDEN, "TENANT_HOST_MISMATCH");
  }
};
