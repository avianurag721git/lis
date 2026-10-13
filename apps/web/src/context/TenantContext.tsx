/**
 * Monorepo entry: apps/web/src/context/TenantContext.tsx
 */
export { TenantProvider, useTenant } from "../../../frontend/src/modules/tenant/tenant.context";
export type {
  TenantBranding,
  TenantConfig,
  TenantSaas,
  SubscriptionPlan,
  SubscriptionStatus
} from "../../../frontend/src/modules/tenant/tenant.types";
