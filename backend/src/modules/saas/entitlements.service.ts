import { FEATURE_KEYS, FeatureKey, FeatureMap, SubscriptionPlan } from "./saas.types";

const PLAN_MATRIX: Record<SubscriptionPlan, readonly FeatureKey[]> = {
  STARTER: [],
  PRO: ["analytics", "refunds"],
  ENTERPRISE: ["analytics", "refunds", "operations_console", "advanced_audit", "api_bulk"]
};

const emptyFeatures = (): FeatureMap =>
  FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as FeatureMap);

/**
 * Plan defines baseline features; per-tenant `feature_flags` JSON overrides (true/false wins).
 */
export const entitlementsService = {
  resolveEffectiveFeatures(plan: SubscriptionPlan, featureFlags: Record<string, boolean>): FeatureMap {
    const base = emptyFeatures();
    for (const key of PLAN_MATRIX[plan]) {
      base[key] = true;
    }
    for (const [rawKey, value] of Object.entries(featureFlags)) {
      if (FEATURE_KEYS.includes(rawKey as FeatureKey)) {
        base[rawKey as FeatureKey] = value;
      }
    }
    return base;
  },

  hasFeature(features: FeatureMap, key: FeatureKey): boolean {
    return Boolean(features[key]);
  }
};
