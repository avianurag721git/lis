import type { ReportLayoutConfig } from "../saas/reportLayout.types";

export type { ReportLayoutConfig } from "../saas/reportLayout.types";

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

export type TenantConfiguration = TenantConfig & {
  branding: TenantBranding;
  settings: TenantSettings;
  finance: TenantFinance;
};

export type Tenant = {
  id: string;
  name: string;
  subdomain: string;
  configuration: TenantConfiguration;
  createdAt: string;
};
