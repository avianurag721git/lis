import {
  TenantConfigResponse,
  SubscriptionPlan,
  defaultBranding,
  defaultFinance,
  defaultSettings
} from "./saas.types";
import { tenantRepository } from "../tenant/tenant.repository";
import { entitlementsService } from "./entitlements.service";
import { saasTenantRepository } from "./saasTenant.repository";
import { subscriptionRepository } from "./subscription.repository";
import { SaasRequestContext } from "./saas.types";

const defaultContext = (plan: SubscriptionPlan = "STARTER"): SaasRequestContext => ({
  plan,
  subscriptionStatus: "ACTIVE",
  features: entitlementsService.resolveEffectiveFeatures(plan, {}),
  featureFlags: {}
});

export const saasContextService = {
  async loadForTenant(tenantId: string): Promise<SaasRequestContext> {
    const row = await saasTenantRepository.findById(tenantId);
    if (row) {
      return {
        plan: row.plan,
        subscriptionStatus: row.subscriptionStatus,
        features: entitlementsService.resolveEffectiveFeatures(row.plan, row.featureFlags),
        featureFlags: row.featureFlags
      };
    }

    const mem = tenantRepository.findById(tenantId);
    if (mem) {
      const plan = "PRO";
      return {
        plan,
        subscriptionStatus: "ACTIVE",
        features: entitlementsService.resolveEffectiveFeatures(plan, {}),
        featureFlags: {}
      };
    }

    return defaultContext("STARTER");
  },

  async buildTenantConfigResponse(tenantId: string): Promise<TenantConfigResponse> {
    const row = await saasTenantRepository.findById(tenantId);
    const mem = tenantRepository.findById(tenantId);

    if (!row && !mem) {
      const plan: SubscriptionPlan = "STARTER";
      const branding = defaultBranding();
      const settings = defaultSettings(plan);
      return {
        configuration: {
          brandingName: "",
          logoUrl: null,
          reportTemplate: "STANDARD",
          branding,
          settings,
          finance: defaultFinance()
        },
        saas: {
          plan,
          subscriptionStatus: "ACTIVE",
          features: entitlementsService.resolveEffectiveFeatures(plan, {}),
          featureFlags: {}
        }
      };
    }

    const plan = row?.plan ?? (mem ? "PRO" : "STARTER");
    const subscriptionStatus = row?.subscriptionStatus ?? "ACTIVE";
    const featureFlags = row?.featureFlags ?? {};
    const features = entitlementsService.resolveEffectiveFeatures(plan, featureFlags);
    const branding = row?.branding ?? mem?.configuration.branding ?? defaultBranding();
    const settings = row?.settings ?? mem?.configuration.settings ?? defaultSettings(plan);
    const finance = row?.configuration.finance ?? mem?.configuration.finance ?? defaultFinance();
    const configuration = row?.configuration ?? {
      brandingName: mem!.configuration.brandingName,
      logoUrl: mem!.configuration.logoUrl,
      reportTemplate: mem!.configuration.reportTemplate,
      branding,
      settings,
      finance
    };

    const history = await subscriptionRepository.listForTenant(tenantId, 3);

    return {
      configuration: { ...configuration, branding, settings, finance },
      saas: {
        plan,
        subscriptionStatus,
        features,
        featureFlags,
        ...(history.length > 0 ? { recentSubscriptions: history } : {})
      }
    };
  }
};
