import { db } from "../postgres";
import { seedLog } from "./seedLogger";
import { APOLLO_TENANT_ID, CITYLABS_TENANT_ID } from "./productionSeed.constants";

export type SeededTenants = {
  apollo: string;
  citylabs: string;
};

export const seedProductionTenants = async (): Promise<SeededTenants> => {
  seedLog.header("Tenants");

  const tenants = [
    {
      id: APOLLO_TENANT_ID,
      subdomain: "apollo",
      name: "Apollo Pathology Labs",
      plan: "ENTERPRISE",
      configuration: {
        brandingName: "Apollo Pathology Labs",
        logoUrl: null,
        reportTemplate: "STANDARD",
        primaryColor: "#0284c7",
        customDomain: "apollo.yourdomain.com"
      }
    },
    {
      id: CITYLABS_TENANT_ID,
      subdomain: "citylabs",
      name: "City Diagnostic Center",
      plan: "PRO",
      configuration: {
        brandingName: "City Diagnostic Center",
        logoUrl: null,
        reportTemplate: "STANDARD",
        primaryColor: "#16a34a"
      }
    }
  ];

  for (const t of tenants) {
    await db.query(
      `INSERT INTO saas_tenants (id, subdomain, name, plan, subscription_status, feature_flags, configuration)
       VALUES ($1,$2,$3,$4,'ACTIVE','{}'::jsonb,$5::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         subdomain = EXCLUDED.subdomain,
         name = EXCLUDED.name,
         plan = EXCLUDED.plan,
         configuration = EXCLUDED.configuration,
         updated_at = NOW()`,
      [t.id, t.subdomain, t.name, t.plan, JSON.stringify(t.configuration)]
    );
    seedLog.step(t.name, `${t.plan} · ${t.subdomain}`);
  }

  seedLog.count("Tenant", tenants.length);
  return { apollo: APOLLO_TENANT_ID, citylabs: CITYLABS_TENANT_ID };
};
