import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import {
  SaasTenantRow,
  SubscriptionPlan,
  SubscriptionStatus,
  TenantBranding,
  TenantConfiguration,
  TenantFinance,
  TenantSettings,
  clampGstPercent,
  defaultBranding,
  defaultFinance,
  defaultSettings,
  normalizePlan
} from "./saas.types";
import { parseReportLayout } from "./reportLayout.types";
import { Tenant } from "../tenant/tenant.types";

const isPg = (): boolean => Boolean(env.databaseUrl);

const parseBranding = (raw: unknown, config: Record<string, unknown>): TenantBranding => {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaults = defaultBranding();
  const logoFromConfig = typeof config.logoUrl === "string" ? config.logoUrl : null;
  return {
    logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : logoFromConfig,
    primaryColor: typeof b.primaryColor === "string" ? b.primaryColor : defaults.primaryColor,
    secondaryColor: typeof b.secondaryColor === "string" ? b.secondaryColor : defaults.secondaryColor,
    labHeaderAddress: typeof b.labHeaderAddress === "string" ? b.labHeaderAddress : defaults.labHeaderAddress,
    nablRegNo: typeof b.nablRegNo === "string" ? b.nablRegNo : defaults.nablRegNo,
    phone: typeof b.phone === "string" ? b.phone : defaults.phone,
    email: typeof b.email === "string" ? b.email : defaults.email,
    website: typeof b.website === "string" ? b.website : defaults.website,
    showNablBadge: typeof b.showNablBadge === "boolean" ? b.showNablBadge : defaults.showNablBadge,
    showNabhBadge: typeof b.showNabhBadge === "boolean" ? b.showNabhBadge : defaults.showNabhBadge,
    accreditationLine:
      typeof b.accreditationLine === "string" ? b.accreditationLine : defaults.accreditationLine,
    processedAtLabel: typeof b.processedAtLabel === "string" ? b.processedAtLabel : defaults.processedAtLabel,
    reportDisclaimer: typeof b.reportDisclaimer === "string" ? b.reportDisclaimer : defaults.reportDisclaimer,
    reportLayout: (() => {
      const layout = parseReportLayout(b.reportLayout);
      // Legacy tenants without reportLayout: sync badge toggles into the default layout.
      if (b.reportLayout == null) {
        const showNabl = typeof b.showNablBadge === "boolean" ? b.showNablBadge : defaults.showNablBadge;
        const showNabh = typeof b.showNabhBadge === "boolean" ? b.showNabhBadge : defaults.showNabhBadge;
        return {
          ...layout,
          header: {
            ...layout.header,
            fields: layout.header.fields.map((f) => {
              if (f.id === "nablBadge") return { ...f, enabled: showNabl };
              if (f.id === "nabhBadge") return { ...f, enabled: showNabh };
              return f;
            })
          }
        };
      }
      return layout;
    })()
  };
};

const parseSettings = (raw: unknown, plan: SubscriptionPlan): TenantSettings => {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaults = defaultSettings(plan);
  return {
    maxUsers: typeof s.maxUsers === "number" ? s.maxUsers : defaults.maxUsers,
    maxBranches: typeof s.maxBranches === "number" ? s.maxBranches : defaults.maxBranches,
    enabledModules: Array.isArray(s.enabledModules)
      ? s.enabledModules.filter((m): m is string => typeof m === "string")
      : defaults.enabledModules
  };
};

const parseFinance = (raw: unknown): TenantFinance => {
  const f = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaults = defaultFinance();
  return {
    defaultGstPercent: clampGstPercent(f.defaultGstPercent, defaults.defaultGstPercent),
    labGstin: typeof f.labGstin === "string" ? f.labGstin.trim() : defaults.labGstin,
    currencyCode:
      typeof f.currencyCode === "string" && f.currencyCode.trim()
        ? f.currencyCode.trim().toUpperCase()
        : defaults.currencyCode,
    invoicePrefix:
      typeof f.invoicePrefix === "string" && f.invoicePrefix.trim()
        ? f.invoicePrefix.trim().toUpperCase()
        : defaults.invoicePrefix,
    placeOfSupply: typeof f.placeOfSupply === "string" ? f.placeOfSupply.trim() : defaults.placeOfSupply
  };
};

const normalizeConfiguration = (
  raw: unknown,
  branding: TenantBranding,
  settings: TenantSettings,
  finance?: TenantFinance
): TenantConfiguration => {
  const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const reportTemplate = c.reportTemplate === "DETAILED" ? "DETAILED" : "STANDARD";
  return {
    brandingName: typeof c.brandingName === "string" ? c.brandingName : "",
    logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : branding.logoUrl,
    reportTemplate,
    branding,
    settings,
    finance: finance ?? parseFinance(c.finance)
  };
};

const normalizeFlags = (raw: Record<string, unknown>): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
};

const mapRow = (row: {
  id: string;
  subdomain: string;
  name: string;
  plan: string;
  subscription_status: string;
  feature_flags: Record<string, unknown>;
  configuration: unknown;
  custom_domain?: string | null;
  branding?: unknown;
  settings?: unknown;
}): SaasTenantRow => {
  const plan = normalizePlan(row.plan);
  const c = row.configuration && typeof row.configuration === "object" ? (row.configuration as Record<string, unknown>) : {};
  const branding = parseBranding(row.branding ?? c.branding, c);
  const settings = parseSettings(row.settings ?? c.settings, plan);
  const finance = parseFinance(c.finance);
  return {
    id: row.id,
    subdomain: row.subdomain,
    name: row.name,
    customDomain: row.custom_domain ?? null,
    plan,
    subscriptionStatus: row.subscription_status as SubscriptionStatus,
    featureFlags: normalizeFlags(row.feature_flags),
    configuration: normalizeConfiguration(row.configuration, branding, settings, finance),
    branding,
    settings
  };
};

const selectCols = `id, subdomain, name, plan, subscription_status, feature_flags, configuration,
  custom_domain, branding, settings`;

export const saasTenantRepository = {
  async listAll(): Promise<SaasTenantRow[]> {
    if (!isPg()) {
      return [];
    }
    try {
      const result = await db.query(
        `SELECT ${selectCols} FROM saas_tenants ORDER BY created_at ASC`
      );
      return result.rows.map((row) => mapRow(row));
    } catch (err) {
      logger.warn({ err }, "saas_tenants list failed");
      return [];
    }
  },

  async findBySubdomain(subdomain: string): Promise<SaasTenantRow | null> {
    if (!isPg()) {
      return null;
    }
    try {
      const result = await db.query(
        `SELECT ${selectCols} FROM saas_tenants WHERE LOWER(subdomain) = LOWER($1)`,
        [subdomain]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    } catch (err) {
      logger.warn({ err, subdomain }, "saas_tenants lookup failed");
      return null;
    }
  },

  async findByCustomDomain(domain: string): Promise<SaasTenantRow | null> {
    if (!isPg()) {
      return null;
    }
    try {
      const result = await db.query(
        `SELECT ${selectCols} FROM saas_tenants WHERE LOWER(custom_domain) = LOWER($1)`,
        [domain]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    } catch (err) {
      logger.warn({ err, domain }, "custom domain lookup failed");
      return null;
    }
  },

  async findById(tenantId: string): Promise<SaasTenantRow | null> {
    if (!isPg()) {
      return null;
    }
    try {
      const result = await db.query(`SELECT ${selectCols} FROM saas_tenants WHERE id = $1`, [tenantId]);
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    } catch (err) {
      logger.warn({ err, tenantId }, "saas_tenants lookup failed");
      return null;
    }
  },

  async upsertFromTenant(tenant: Tenant, plan: SubscriptionPlan = "STARTER"): Promise<void> {
    if (!isPg()) {
      return;
    }
    const branding = tenant.configuration.branding ?? defaultBranding();
    const settings = tenant.configuration.settings ?? defaultSettings(plan);
    await db.query(
      `INSERT INTO saas_tenants (id, subdomain, name, plan, subscription_status, feature_flags, configuration, branding, settings, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', '{}'::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         subdomain = EXCLUDED.subdomain,
         name = EXCLUDED.name,
         plan = EXCLUDED.plan,
         configuration = EXCLUDED.configuration,
         branding = EXCLUDED.branding,
         settings = EXCLUDED.settings,
         updated_at = NOW()`,
      [
        tenant.id,
        tenant.subdomain.toLowerCase(),
        tenant.name,
        plan,
        JSON.stringify(tenant.configuration),
        JSON.stringify(branding),
        JSON.stringify(settings)
      ]
    );
  },

  async create(input: {
    id: string;
    name: string;
    subdomain: string;
    plan: SubscriptionPlan;
    customDomain?: string | null;
    branding?: Partial<TenantBranding>;
    settings?: Partial<TenantSettings>;
    configuration?: Partial<TenantConfiguration>;
  }): Promise<SaasTenantRow> {
    if (!isPg()) {
      throw new Error("Database not configured");
    }
    const plan = input.plan;
    const branding = { ...defaultBranding(), ...input.branding };
    const settings = { ...defaultSettings(plan), ...input.settings };
    const finance = parseFinance(input.configuration?.finance);
    const configuration = normalizeConfiguration(
      {
        brandingName: input.name,
        logoUrl: branding.logoUrl,
        reportTemplate: "STANDARD",
        ...input.configuration,
        finance
      },
      branding,
      settings,
      finance
    );
    await db.query(
      `INSERT INTO saas_tenants (id, subdomain, name, plan, subscription_status, feature_flags, configuration, branding, settings, custom_domain)
       VALUES ($1, $2, $3, $4, 'ACTIVE', '{}'::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
      [
        input.id,
        input.subdomain.toLowerCase(),
        input.name,
        plan,
        JSON.stringify(configuration),
        JSON.stringify(branding),
        JSON.stringify(settings),
        input.customDomain ?? null
      ]
    );
    const row = await this.findById(input.id);
    if (!row) throw new Error("Failed to create tenant");
    return row;
  },

  async setPlan(tenantId: string, plan: SubscriptionPlan): Promise<void> {
    if (!isPg()) return;
    await db.query(`UPDATE saas_tenants SET plan = $2, updated_at = NOW() WHERE id = $1`, [tenantId, plan]);
  },

  async setSubscriptionStatus(tenantId: string, status: SubscriptionStatus): Promise<void> {
    if (!isPg()) return;
    await db.query(`UPDATE saas_tenants SET subscription_status = $2, updated_at = NOW() WHERE id = $1`, [
      tenantId,
      status
    ]);
  },

  async updateSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<void> {
    if (!isPg()) return;
    const existing = await this.findById(tenantId);
    if (!existing) return;
    const merged = { ...existing.settings, ...settings };
    await db.query(`UPDATE saas_tenants SET settings = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      tenantId,
      JSON.stringify(merged)
    ]);
  },

  async updateBranding(tenantId: string, branding: Partial<TenantBranding>): Promise<void> {
    if (!isPg()) return;
    const existing = await this.findById(tenantId);
    if (!existing) return;
    const merged = { ...existing.branding, ...branding };
    await db.query(`UPDATE saas_tenants SET branding = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      tenantId,
      JSON.stringify(merged)
    ]);
  },

  async updateFeatureFlags(tenantId: string, flags: Record<string, boolean>): Promise<void> {
    if (!isPg()) return;
    await db.query(
      `UPDATE saas_tenants SET feature_flags = feature_flags || $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [tenantId, JSON.stringify(flags)]
    );
  },

  async updateConfiguration(
    tenantId: string,
    patch: {
      brandingName?: string;
      logoUrl?: string | null;
      reportTemplate?: "STANDARD" | "DETAILED";
      branding?: Partial<TenantBranding>;
      settings?: Partial<TenantSettings>;
      finance?: Partial<TenantFinance>;
      name?: string;
    }
  ): Promise<SaasTenantRow | null> {
    if (!isPg()) return null;
    const existing = await this.findById(tenantId);
    if (!existing) return null;

    const branding = { ...existing.branding, ...patch.branding };
    const settings = { ...existing.settings, ...patch.settings };
    const finance = {
      ...existing.configuration.finance,
      ...patch.finance,
      defaultGstPercent: clampGstPercent(
        patch.finance?.defaultGstPercent ?? existing.configuration.finance.defaultGstPercent
      )
    };
    if (patch.logoUrl !== undefined) branding.logoUrl = patch.logoUrl;
    if (patch.brandingName !== undefined && branding.logoUrl === existing.branding.logoUrl) {
      /* keep */
    }

    const configuration = normalizeConfiguration(
      {
        brandingName: patch.brandingName ?? existing.configuration.brandingName,
        logoUrl: branding.logoUrl,
        reportTemplate: patch.reportTemplate ?? existing.configuration.reportTemplate,
        finance
      },
      branding,
      settings,
      finance
    );

    await db.query(
      `UPDATE saas_tenants
       SET configuration = $2::jsonb,
           branding = $3::jsonb,
           settings = $4::jsonb,
           name = COALESCE(NULLIF($5, ''), name),
           updated_at = NOW()
       WHERE id = $1`,
      [
        tenantId,
        JSON.stringify(configuration),
        JSON.stringify(branding),
        JSON.stringify(settings),
        patch.name?.trim() ?? ""
      ]
    );
    return this.findById(tenantId);
  },

  async getDefaultGstPercent(tenantId: string): Promise<number> {
    const row = await this.findById(tenantId);
    return row?.configuration.finance.defaultGstPercent ?? defaultFinance().defaultGstPercent;
  }
};
