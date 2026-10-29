import { db } from "../postgres";
import { seedLog } from "./seedLogger";
import { APOLLO_TENANT_ID, CITYLABS_TENANT_ID, DEMO_TENANT_ID } from "./productionSeed.constants";

export type SeededTenants = {
  apollo: string;
  citylabs: string;
  demo: string;
};

export const seedProductionTenants = async (): Promise<SeededTenants> => {
  seedLog.header("Tenants");

  const tenants = [
    {
      id: DEMO_TENANT_ID,
      subdomain: "demo",
      name: "Demo Lab",
      plan: "PRO",
      configuration: {
        brandingName: "Demo Lab",
        logoUrl: null,
        reportTemplate: "DETAILED",
        primaryColor: "#0ea5e9",
        branding: {
          logoUrl: null,
          primaryColor: "#0ea5e9",
          secondaryColor: "#6366f1",
          labHeaderAddress: "Demo Campus, Pune - 411001",
          nablRegNo: "MC-DEMO-01",
          phone: "020-00000000",
          email: "lab@demo.local",
          website: "demo.local",
          showNablBadge: true,
          showNabhBadge: false,
          accreditationLine: "NABL Accredited · Demo environment",
          processedAtLabel: "Demo Lab, Pune",
          reportDisclaimer:
            "This is a computer Generated medical diagnostic report that has been validated by Authorized medical practitioner/Doctor, the report does not need physical signature."
        }
      }
    },
    {
      id: APOLLO_TENANT_ID,
      subdomain: "apollo",
      name: "Apollo Pathology Labs",
      plan: "ENTERPRISE",
      configuration: {
        brandingName: "Apollo Pathology Labs",
        logoUrl: null,
        reportTemplate: "DETAILED",
        primaryColor: "#0284c7",
        customDomain: "apollo.yourdomain.com",
        branding: {
          logoUrl: null,
          primaryColor: "#0284c7",
          secondaryColor: "#b91c1c",
          labHeaderAddress: "12, MG Road, Pune - 411001, Maharashtra",
          nablRegNo: "MC-2345",
          phone: "020-12345678",
          email: "reports@apollopathology.example",
          website: "www.apollopathology.example",
          showNablBadge: true,
          showNabhBadge: false,
          accreditationLine: "NABL Accredited · ISO 15189:2022 Compliant",
          processedAtLabel: "LC93 / Apollo Pathology Labs, Pune",
          reportDisclaimer:
            "This is a computer Generated medical diagnostic report that has been validated by Authorized medical practitioner/Doctor, the report does not need physical signature."
        }
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
        primaryColor: "#16a34a",
        branding: {
          logoUrl: null,
          primaryColor: "#16a34a",
          secondaryColor: "#b91c1c",
          labHeaderAddress: "City Labs Hub, Mumbai",
          nablRegNo: "",
          phone: "022-98765432",
          email: "help@citylabs.example",
          website: "",
          showNablBadge: false,
          showNabhBadge: false,
          accreditationLine: "",
          processedAtLabel: "City Diagnostic Center",
          reportDisclaimer:
            "This is a computer Generated medical diagnostic report that has been validated by Authorized medical practitioner/Doctor, the report does not need physical signature."
        }
      }
    }
  ];

  for (const t of tenants) {
    const branding = (t.configuration as { branding?: Record<string, unknown> }).branding ?? {};
    await db.query(
      `INSERT INTO saas_tenants (id, subdomain, name, plan, subscription_status, feature_flags, configuration, branding)
       VALUES ($1,$2,$3,$4,'ACTIVE','{}'::jsonb,$5::jsonb,$6::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         subdomain = EXCLUDED.subdomain,
         name = EXCLUDED.name,
         plan = EXCLUDED.plan,
         configuration = EXCLUDED.configuration,
         branding = EXCLUDED.branding,
         updated_at = NOW()`,
      [t.id, t.subdomain, t.name, t.plan, JSON.stringify(t.configuration), JSON.stringify(branding)]
    );
    seedLog.step(t.name, `${t.plan} · ${t.subdomain}`);
  }

  seedLog.count("Tenant", tenants.length);
  return { apollo: APOLLO_TENANT_ID, citylabs: CITYLABS_TENANT_ID, demo: DEMO_TENANT_ID };
};
