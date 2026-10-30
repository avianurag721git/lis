import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";
import { registerUser } from "../auth/auth.service";
import { saasTenantRepository } from "../saas/saasTenant.repository";
import { subscriptionRepository } from "../saas/subscription.repository";
import {
  PLAN_MRR_USD,
  SubscriptionPlan,
  SubscriptionStatus,
  defaultBranding,
  defaultFinance,
  defaultSettings
} from "../saas/saas.types";
import { tenantRepository } from "../tenant/tenant.repository";
import { tenantService } from "../tenant/tenant.service";
import { runQaDatabaseSeed } from "../../database/qaSeed";

export type SaasOverview = {
  totalTenants: number;
  activeTenants: number;
  mrrUsd: number;
  totalActiveUsers: number;
  totalSampleVolumeMonth: number;
};

export type TenantAdminRow = {
  id: string;
  name: string;
  subdomain: string;
  customDomain: string | null;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  activeUsers: number;
  sampleVolumeMonth: number;
  mrrUsd: number;
  enabledModules: string[];
  createdAt: string;
};

const planPrice = (plan: SubscriptionPlan): number => PLAN_MRR_USD[plan] ?? 0;

const countActiveUsers = async (tenantId: string): Promise<number> => {
  if (!env.databaseUrl) return 1;
  try {
    const r = await db.query(`SELECT active_users FROM tenant_usage_metrics WHERE tenant_id = $1`, [tenantId]);
    if (r.rows[0]) return (r.rows[0].active_users as number) ?? 0;
    const samples = await db.query(
      `SELECT COUNT(DISTINCT created_by_user_id)::int AS c FROM audit_logs WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [tenantId]
    );
    return Math.max(1, (samples.rows[0]?.c as number) ?? 1);
  } catch {
    return 1;
  }
};

const countSampleVolume = async (tenantId: string): Promise<number> => {
  if (!env.databaseUrl) return 0;
  try {
    const r = await db.query(`SELECT sample_volume_month FROM tenant_usage_metrics WHERE tenant_id = $1`, [tenantId]);
    if (r.rows[0]) return (r.rows[0].sample_volume_month as number) ?? 0;
    const samples = await db.query(
      `SELECT COUNT(*)::int AS c FROM samples WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [tenantId]
    );
    return (samples.rows[0]?.c as number) ?? 0;
  } catch {
    return 0;
  }
};

export const saasAdminService = {
  async getOverview(): Promise<SaasOverview> {
    const tenants = await saasTenantRepository.listAll();
    const memTenants = tenantRepository.listAll();
    const allIds = new Set([...tenants.map((t) => t.id), ...memTenants.map((t) => t.id)]);

    let mrrUsd = 0;
    let activeTenants = 0;

    for (const t of tenants) {
      if (t.subscriptionStatus === "ACTIVE" || t.subscriptionStatus === "TRIALING") {
        activeTenants += 1;
        mrrUsd += planPrice(t.plan);
      }
    }

    const [userCounts, sampleCounts] = await Promise.all([
      Promise.all(tenants.map((t) => countActiveUsers(t.id))),
      Promise.all(tenants.map((t) => countSampleVolume(t.id)))
    ]);
    const totalActiveUsers = userCounts.reduce((sum, n) => sum + n, 0);
    const totalSampleVolumeMonth = sampleCounts.reduce((sum, n) => sum + n, 0);

    return {
      totalTenants: allIds.size,
      activeTenants,
      mrrUsd,
      totalActiveUsers,
      totalSampleVolumeMonth
    };
  },

  async listTenants(): Promise<TenantAdminRow[]> {
    const rows = await saasTenantRepository.listAll();
    return Promise.all(
      rows.map(async (t) => {
        const [activeUsers, sampleVolumeMonth] = await Promise.all([
          countActiveUsers(t.id),
          countSampleVolume(t.id)
        ]);
        return {
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          customDomain: t.customDomain,
          plan: t.plan,
          subscriptionStatus: t.subscriptionStatus,
          activeUsers,
          sampleVolumeMonth,
          mrrUsd: planPrice(t.plan),
          enabledModules: t.settings.enabledModules,
          createdAt: new Date().toISOString()
        };
      })
    );
  },

  async createTenant(input: {
    name: string;
    subdomain: string;
    plan: SubscriptionPlan;
    customDomain?: string | null;
    branding?: Partial<ReturnType<typeof defaultBranding>>;
  }) {
    const existing = tenantRepository.findBySubdomain(input.subdomain);
    if (existing) {
      throw new AppError("Subdomain already in use", HTTP_STATUS.CONFLICT, "SUBDOMAIN_EXISTS");
    }
    const pgExisting = await saasTenantRepository.findBySubdomain(input.subdomain);
    if (pgExisting) {
      throw new AppError("Subdomain already in use", HTTP_STATUS.CONFLICT, "SUBDOMAIN_EXISTS");
    }

    const id = randomUUID();
    const branding = { ...defaultBranding(), ...input.branding, logoUrl: input.branding?.logoUrl ?? null };
    const settings = defaultSettings(input.plan);
    const tenant = tenantRepository.create({
      id,
      name: input.name,
      subdomain: input.subdomain,
      configuration: {
        brandingName: input.name,
        logoUrl: branding.logoUrl,
        reportTemplate: "STANDARD",
        branding,
        settings,
        finance: defaultFinance()
      }
    });

    try {
      await saasTenantRepository.create({
        id,
        name: input.name,
        subdomain: input.subdomain,
        plan: input.plan,
        customDomain: input.customDomain ?? null,
        branding,
        settings
      });
      await subscriptionRepository.createInitialSubscription(id, input.plan);
    } catch (err) {
      logger.warn({ err }, "PG tenant create partial failure");
    }

    return tenant;
  },

  async updateTenant(
    tenantId: string,
    patch: {
      plan?: SubscriptionPlan;
      subscriptionStatus?: SubscriptionStatus;
      enabledModules?: string[];
      suspend?: boolean;
    }
  ): Promise<void> {
    const mem = tenantRepository.findById(tenantId);
    const pg = await saasTenantRepository.findById(tenantId);
    if (!mem && !pg) {
      throw new AppError("Tenant not found", HTTP_STATUS.NOT_FOUND, "TENANT_NOT_FOUND");
    }
    if (patch.plan) {
      await saasTenantRepository.setPlan(tenantId, patch.plan);
      await tenantService.upgradePlan(tenantId, patch.plan);
    }
    if (patch.subscriptionStatus) {
      await saasTenantRepository.setSubscriptionStatus(tenantId, patch.subscriptionStatus);
    }
    if (patch.suspend) {
      await saasTenantRepository.setSubscriptionStatus(tenantId, "SUSPENDED");
    }
    if (patch.enabledModules) {
      await saasTenantRepository.updateSettings(tenantId, { enabledModules: patch.enabledModules });
    }
  },

  async onboard(input: {
    labName: string;
    subdomain: string;
    plan: SubscriptionPlan;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
    labAddress?: string;
    nablRegNo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }) {
    const subdomain = input.subdomain.toLowerCase().trim();
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      throw new AppError("Invalid subdomain format", HTTP_STATUS.BAD_REQUEST, "INVALID_SUBDOMAIN");
    }

    const tenant = await this.createTenant({
      name: input.labName,
      subdomain,
      plan: input.plan,
      branding: {
        labHeaderAddress: input.labAddress ?? "",
        nablRegNo: input.nablRegNo ?? "",
        primaryColor: input.primaryColor ?? "#0b5cab",
        secondaryColor: input.secondaryColor ?? "#b91c1c",
        logoUrl: null
      }
    });

    const auth = await registerUser({
      tenantId: tenant.id,
      name: input.adminName,
      email: input.adminEmail,
      password: input.adminPassword,
      role: "LAB_MANAGER"
    });

    try {
      await runQaDatabaseSeed(tenant.id, auth.user.id);
    } catch (err) {
      logger.warn({ err, tenantId: tenant.id }, "Onboarding seed skipped");
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        loginUrl: `https://${subdomain}.${env.saasRootDomain}/login`
      },
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken
    };
  }
};
