import { seedLog } from "./seedLogger";
import {
  APOLLO_TENANT_ID,
  CITYLABS_TENANT_ID,
  DEMO_TENANT_ID,
  SEED_PASSWORD
} from "./productionSeed.constants";
import { clearProductionSeedData } from "./clearSeedData";
import { seedProductionTenants } from "./seedTenants";
import { seedProductionCatalog } from "./seedCatalog";
import { seedProductionClinical, seedCityLabsMinimal } from "./seedClinical";
import { seedProductionInventoryQc } from "./seedInventoryQc";
import { seedProductionExtended } from "./seedExtended";
import { syncMongoProductionSeed } from "./seedMongo";
import { seedProductionAuthUsers } from "../../modules/auth/productionUsers.seed";
import { seedQaDemoUsers } from "../../modules/auth/auth.service";
import { seedQaB2BFranchisee, seedQaPathologistProfile } from "../qaSeed";
import { env } from "../../config/env";

export type RunProductionSeedOptions = {
  clearBeforeSeed?: boolean;
  password?: string;
  /** Demo Lab (@demo.local) password — defaults to AUTH_SEED_PASSWORD / DemoPass123! */
  demoPassword?: string;
  /** Also seed Demo Lab tenant with users + catalog (default true). */
  includeDemoTenant?: boolean;
};

export const runProductionSeed = async (options: RunProductionSeedOptions = {}): Promise<void> => {
  const password = options.password ?? SEED_PASSWORD;
  const demoPassword = options.demoPassword ?? env.authSeedPassword;
  const clearBeforeSeed = options.clearBeforeSeed ?? true;
  const includeDemoTenant = options.includeDemoTenant ?? true;

  seedLog.header("Production / Sample Database Seeder");
  seedLog.info(`Tenants: ${includeDemoTenant ? "demo · " : ""}${APOLLO_TENANT_ID} · ${CITYLABS_TENANT_ID}`);
  seedLog.info(`Apollo password: ${password}${includeDemoTenant ? ` · Demo password: ${demoPassword}` : ""}`);

  if (clearBeforeSeed) {
    await clearProductionSeedData();
  }

  const users = await seedProductionAuthUsers(password);
  seedLog.header("Users (Apollo + platform)");
  seedLog.count("User", 8);
  seedLog.info("SUPER_ADMIN: admin@lis.com · Apollo staff @apollo.com · Franchisee: center1@franchisee.com");

  await seedProductionTenants();

  if (includeDemoTenant) {
    seedLog.header("Users (Demo Lab)");
    const demoUsers = await seedQaDemoUsers(DEMO_TENANT_ID, demoPassword);
    seedLog.count("User", 6);
    await seedProductionCatalog(DEMO_TENANT_ID);
    await seedQaB2BFranchisee(DEMO_TENANT_ID);
    await seedQaPathologistProfile(DEMO_TENANT_ID, demoUsers.pathologist);
    seedLog.step("Demo Lab", "catalog + B2B wallet + pathologist signature");
  }

  const catalog = await seedProductionCatalog(APOLLO_TENANT_ID);
  await seedProductionClinical(APOLLO_TENANT_ID, catalog, users);
  await seedProductionInventoryQc(APOLLO_TENANT_ID, users.labTech);
  await seedProductionExtended(APOLLO_TENANT_ID, catalog, users);
  await seedCityLabsMinimal(CITYLABS_TENANT_ID);
  await syncMongoProductionSeed(users);

  seedLog.done({
    Tenants: includeDemoTenant ? 3 : 2,
    "Apollo users": 8,
    ...(includeDemoTenant ? { "Demo users": 6 } : {}),
    Patients: 5,
    Tests: "6+ per lab",
    Packages: 2,
    Orders: 4,
    Samples: 4,
    "Lab Results": 5,
    Reagents: 2,
    "QC Runs": 15,
    "Apollo password": password,
    ...(includeDemoTenant ? { "Demo password": demoPassword } : {})
  });
};
