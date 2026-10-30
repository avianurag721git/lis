import type { ReportLayoutConfig } from "./reportLayout.types";
import { defaultReportLayout, parseReportLayout } from "./reportLayout.types";

export type { ReportLayoutConfig } from "./reportLayout.types";
export { defaultReportLayout, parseReportLayout } from "./reportLayout.types";

export type TenantBranding = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  labHeaderAddress: string;
  nablRegNo: string;
  phone: string;
  email: string;
  website: string;
  showNablBadge: boolean;
  showNabhBadge: boolean;
  accreditationLine: string;
  processedAtLabel: string;
  reportDisclaimer: string;
  reportLayout: ReportLayoutConfig;
};

export type TenantSettings = {
  maxUsers: number;
  maxBranches: number;
  enabledModules: string[];
};

/** ERP-style finance / tax defaults (tenant-scoped). */
export type TenantFinance = {
  defaultGstPercent: number;
  labGstin: string;
  currencyCode: string;
  invoicePrefix: string;
  placeOfSupply: string;
};

export type TenantConfig = {
  brandingName: string;
  logoUrl: string | null;
  reportTemplate: "STANDARD" | "DETAILED";
  branding?: TenantBranding;
  settings?: TenantSettings;
  finance?: TenantFinance;
};

export type SubscriptionPlan = "STARTER" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "SUSPENDED";

export type FeatureKey =
  | "analytics"
  | "refunds"
  | "operations_console"
  | "advanced_audit"
  | "api_bulk";

export type FeatureMap = Record<FeatureKey, boolean>;

export type TenantSaas = {
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  features: FeatureMap;
  featureFlags: Record<string, boolean>;
  recentSubscriptions?: {
    id: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodEnd: string;
  }[];
};

export type TenantBootstrapResponse = {
  configuration: TenantConfig;
  saas: TenantSaas;
};

export type PublicTenantBranding = {
  tenantId: string;
  name: string;
  subdomain: string;
  brandingName: string;
  branding: TenantBranding;
};

export const defaultBranding = (): TenantBranding => ({
  logoUrl: null,
  primaryColor: "#0b5cab",
  secondaryColor: "#b91c1c",
  labHeaderAddress: "",
  nablRegNo: "",
  phone: "",
  email: "",
  website: "",
  showNablBadge: true,
  showNabhBadge: false,
  accreditationLine: "NABL Accredited · ISO 15189:2022 Compliant",
  processedAtLabel: "",
  reportDisclaimer:
    "This is a computer Generated medical diagnostic report that has been validated by Authorized medical practitioner/Doctor, the report does not need physical signature.",
  reportLayout: defaultReportLayout()
});

export const defaultFinance = (): TenantFinance => ({
  defaultGstPercent: 18,
  labGstin: "27AABCT1332L000",
  currencyCode: "INR",
  invoicePrefix: "INV",
  placeOfSupply: ""
});

export const applyBrandingCssVars = (branding: TenantBranding): void => {
  const root = document.documentElement;
  root.style.setProperty("--primary-color", branding.primaryColor);
  root.style.setProperty("--secondary-color", branding.secondaryColor);
};

export const resolveSubdomain = (): string | null => {
  const host = window.location.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return null;
  }
  const parts = host.split(".");
  if (parts.length >= 3 && parts[0] !== "www" && parts[0] !== "api") {
    return parts[0] ?? null;
  }
  return null;
};
