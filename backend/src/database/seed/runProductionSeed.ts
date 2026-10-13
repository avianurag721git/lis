import { seedLog } from "./seedLogger";
import { APOLLO_TENANT_ID, CITYLABS_TENANT_ID, SEED_PASSWORD } from "./productionSeed.constants";
import { clearProductionSeedData } from "./clearSeedData";
import { seedProductionTenants } from "./seedTenants";
import { seedProductionCatalog } from "./seedCatalog";
import { seedProductionClinical, seedCityLabsMinimal } from "./seedClinical";
import { seedProductionInventoryQc } from "./seedInventoryQc";
import { seedProductionExtended } from "./seedExtended";
import { syncMongoProductionSeed } from "./seedMongo";
import { seedProductionAuthUsers } from "../../modules/auth/productionUsers.seed";

export type RunProductionSeedOptions = {
  clearBeforeSeed?: boolean;
  password?: string;
};

export const runProductionSeed = async (options: RunProductionSeedOptions = {}): Promise<void> => {
  const password = options.password ?? SEED_PASSWORD;
  const clearBeforeSeed = options.clearBeforeSeed ?? true;

  seedLog.header("Production Database Seeder");
  seedLog.info(`Primary tenant: ${APOLLO_TENANT_ID} · Password: ${password}`);

  if (clearBeforeSeed) {
    await clearProductionSeedData();
  }

  const users = await seedProductionAuthUsers(password);
  seedLog.header("Users (in-memory auth)");
  seedLog.count("User", 8);
  seedLog.info("SUPER_ADMIN: admin@lis.com · Apollo staff @apollo.com · Franchisee: center1@franchisee.com");

  await seedProductionTenants();
  const catalog = await seedProductionCatalog(APOLLO_TENANT_ID);
  await seedProductionClinical(APOLLO_TENANT_ID, catalog, users);
  await seedProductionInventoryQc(APOLLO_TENANT_ID, users.labTech);
  await seedProductionExtended(APOLLO_TENANT_ID, catalog, users);
  await seedCityLabsMinimal(CITYLABS_TENANT_ID);
  await syncMongoProductionSeed(users);

  seedLog.done({
    Tenants: 2,
    Users: 8,
    Patients: 5,
    Tests: 6,
    Packages: 2,
    Orders: 4,
    Samples: 4,
    "Lab Results": 5,
    Reagents: 2,
    "QC Runs": 15,
    "Login password": password
  });
};
