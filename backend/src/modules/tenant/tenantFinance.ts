import { defaultFinance } from "../saas/saas.types";
import { saasTenantRepository } from "../saas/saasTenant.repository";

/** Resolve the tenant's configured default GST % (ERP finance setting). */
export const resolveTenantDefaultGst = async (tenantId: string): Promise<number> => {
  try {
    return await saasTenantRepository.getDefaultGstPercent(tenantId);
  } catch {
    return defaultFinance().defaultGstPercent;
  }
};
