import mongoose, { Document, Schema } from "mongoose";

export const SUBSCRIPTION_PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING", "SUSPENDED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

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

export type ITenant = Document & {
  name: string;
  slug: string;
  customDomain: string | null;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  branding: TenantBranding;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
};

const brandingSchema = new Schema<TenantBranding>(
  {
    logoUrl: { type: String, default: null },
    primaryColor: { type: String, default: "#0b5cab" },
    secondaryColor: { type: String, default: "#b91c1c" },
    labHeaderAddress: { type: String, default: "" },
    nablRegNo: { type: String, default: "" }
  },
  { _id: false }
);

const settingsSchema = new Schema<TenantSettings>(
  {
    maxUsers: { type: Number, default: 10 },
    maxBranches: { type: Number, default: 1 },
    enabledModules: {
      type: [String],
      default: ["patients", "orders", "samples", "lab_results", "billing"]
    }
  },
  { _id: false }
);

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    customDomain: { type: String, default: null, sparse: true, unique: true },
    subscriptionPlan: { type: String, enum: SUBSCRIPTION_PLANS, default: "STARTER" },
    subscriptionStatus: { type: String, enum: SUBSCRIPTION_STATUSES, default: "ACTIVE" },
    branding: { type: brandingSchema, default: () => ({}) },
    settings: { type: settingsSchema, default: () => ({}) }
  },
  { timestamps: true }
);

tenantSchema.index({ slug: 1 });
tenantSchema.index({ customDomain: 1 }, { sparse: true });

export const TenantModel = mongoose.models.Tenant ?? mongoose.model<ITenant>("Tenant", tenantSchema);

export const defaultTenantBranding = (): TenantBranding => ({
  logoUrl: null,
  primaryColor: "#0b5cab",
  secondaryColor: "#b91c1c",
  labHeaderAddress: "",
  nablRegNo: ""
});

export const defaultTenantSettings = (plan: SubscriptionPlan = "STARTER"): TenantSettings => {
  const limits: Record<SubscriptionPlan, Pick<TenantSettings, "maxUsers" | "maxBranches">> = {
    STARTER: { maxUsers: 10, maxBranches: 1 },
    PRO: { maxUsers: 50, maxBranches: 5 },
    ENTERPRISE: { maxUsers: 500, maxBranches: 50 }
  };
  const base = limits[plan];
  return {
    ...base,
    enabledModules: ["patients", "orders", "samples", "lab_results", "billing"]
  };
};

export const PLAN_MRR_USD: Record<SubscriptionPlan, number> = {
  STARTER: 99,
  PRO: 299,
  ENTERPRISE: 799
};
