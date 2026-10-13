import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";
import { env } from "../../config/env";
import { saasTenantRepository } from "../saas/saasTenant.repository";
import { subscriptionRepository } from "../saas/subscription.repository";
import { SubscriptionPlan } from "../saas/saas.types";
import { tenantRepository } from "./tenant.repository";
import { Tenant } from "./tenant.types";

type CreateTenantInput = {
  name: string;
  subdomain: string;
  configuration: Tenant["configuration"];
};

type TenantLoginOption = {
  id: string;
  label: string;
};

export const tenantService = {
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const existing = tenantRepository.findBySubdomain(input.subdomain);
    if (existing) {
      throw new AppError("Subdomain already in use", HTTP_STATUS.CONFLICT, "SUBDOMAIN_EXISTS");
    }
    const tenant = tenantRepository.create(input);
    try {
      await saasTenantRepository.upsertFromTenant(tenant, "STARTER");
      await subscriptionRepository.createInitialSubscription(tenant.id, "STARTER");
    } catch (err) {
      logger.warn({ err, tenantId: tenant.id }, "SaaS registry sync failed (database optional)");
    }
    return tenant;
  },

  getTenantConfig(tenantId: string): Tenant["configuration"] {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new AppError("Tenant not found", HTTP_STATUS.NOT_FOUND, "TENANT_NOT_FOUND");
    }
    return tenant.configuration;
  },

  async resolveTenantConfiguration(tenantId: string): Promise<Tenant["configuration"]> {
    const row = await saasTenantRepository.findById(tenantId);
    if (row) {
      return row.configuration;
    }
    return this.getTenantConfig(tenantId);
  },

  async upgradePlan(tenantId: string, plan: SubscriptionPlan): Promise<void> {
    const tenant = tenantRepository.findById(tenantId);
    const pgRow = await saasTenantRepository.findById(tenantId);
    if (!tenant && !pgRow) {
      throw new AppError("Tenant not found", HTTP_STATUS.NOT_FOUND, "TENANT_NOT_FOUND");
    }
    try {
      if (tenant) {
        await saasTenantRepository.upsertFromTenant(tenant, plan);
      } else {
        await saasTenantRepository.setPlan(tenantId, plan);
      }
    } catch (err) {
      logger.warn({ err, tenantId }, "plan sync skipped");
    }
    try {
      await subscriptionRepository.createInitialSubscription(tenantId, plan);
    } catch (err) {
      logger.warn({ err, tenantId }, "subscription row insert skipped");
    }
  },

  async listLoginTenants(): Promise<TenantLoginOption[]> {
    const options = new Map<string, TenantLoginOption>();

    const pgTenants = await saasTenantRepository.listAll();
    for (const row of pgTenants) {
      options.set(row.id, { id: row.id, label: `${row.name} (${row.subdomain})` });
    }

    for (const row of tenantRepository.listAll()) {
      if (!options.has(row.id)) {
        options.set(row.id, { id: row.id, label: `${row.name} (${row.subdomain})` });
      }
    }

    if (env.authSeedDemoUser && !options.has(env.authSeedTenantId)) {
      options.set(env.authSeedTenantId, {
        id: env.authSeedTenantId,
        label: `Demo Tenant (${env.authSeedTenantId})`
      });
    }

    return Array.from(options.values());
  }
};
