export const SUBSCRIPTION_PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/** @deprecated Use STARTER — kept for backward compatibility */
export type LegacyPlan = "BASIC" | SubscriptionPlan;

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING", "SUSPENDED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const LIS_MODULES = [
  "patients",
  "orders",
  "samples",
  "lab_results",
  "billing",
  "b2b",
  "inventory",
  "pathologist",
  "analytics",
  "hl7_astm"
] as const;
export type LisModule = (typeof LIS_MODULES)[number];

/** Logical product features — entitlement keys. */
export const FEATURE_KEYS = [
  "analytics",
  "refunds",
  "operations_console",
  "advanced_audit",
  "api_bulk"
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureMap = Record<FeatureKey, boolean>;

export type TenantBranding = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  labHeaderAddress: string;
  nablRegNo: string;
};

export type TenantSettings = {
  maxUsers: number;
  maxBranches: number;
  enabledModules: string[];
};

/** ERP-style finance / tax defaults for the lab (tenant-scoped). */
export type TenantFinance = {
  /** Default GST % applied on new bills/orders when not overridden. */
  defaultGstPercent: number;
  labGstin: string;
  currencyCode: string;
  invoicePrefix: string;
  /** e.g. state code for CGST/SGST vs IGST split */
  placeOfSupply: string;
};

export type TenantConfiguration = {
  brandingName: string;
  logoUrl: string | null;
  reportTemplate: "STANDARD" | "DETAILED";
  branding: TenantBranding;
  settings: TenantSettings;
  finance: TenantFinance;
};

export type SaasTenantRow = {
  id: string;
  subdomain: string;
  name: string;
  customDomain: string | null;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  featureFlags: Record<string, boolean>;
  configuration: TenantConfiguration;
  branding: TenantBranding;
  settings: TenantSettings;
};

export type SaasRequestContext = {
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  features: FeatureMap;
  featureFlags: Record<string, boolean>;
};

export type SubscriptionHistoryItem = {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
};

export type TenantConfigResponse = {
  configuration: TenantConfiguration;
  saas: {
    plan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    features: FeatureMap;
    featureFlags: Record<string, boolean>;
    recentSubscriptions?: SubscriptionHistoryItem[];
  };
};

export const PLAN_MRR_USD: Record<SubscriptionPlan, number> = {
  STARTER: 99,
  PRO: 299,
  ENTERPRISE: 799
};

export const normalizePlan = (plan: string): SubscriptionPlan => {
  if (plan === "BASIC") return "STARTER";
  if (plan === "PRO" || plan === "ENTERPRISE") return plan;
  return "STARTER";
};

export const defaultBranding = (): TenantBranding => ({
  logoUrl: null,
  primaryColor: "#0b5cab",
  secondaryColor: "#b91c1c",
  labHeaderAddress: "",
  nablRegNo: ""
});

export const defaultSettings = (plan: SubscriptionPlan = "STARTER"): TenantSettings => {
  const limits: Record<SubscriptionPlan, Pick<TenantSettings, "maxUsers" | "maxBranches">> = {
    STARTER: { maxUsers: 10, maxBranches: 1 },
    PRO: { maxUsers: 50, maxBranches: 5 },
    ENTERPRISE: { maxUsers: 500, maxBranches: 50 }
  };
  return {
    ...limits[plan],
    enabledModules: ["patients", "orders", "samples", "lab_results", "billing"]
  };
};

export const defaultFinance = (): TenantFinance => ({
  defaultGstPercent: 18,
  labGstin: "27AABCT1332L000",
  currencyCode: "INR",
  invoicePrefix: "INV",
  placeOfSupply: ""
});

export const clampGstPercent = (value: unknown, fallback = 18): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(40, Math.round(n * 100) / 100);
};
