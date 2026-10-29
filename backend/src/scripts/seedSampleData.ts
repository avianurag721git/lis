/**
 * Sample / QA database seed — labs, users, catalog (tests + parameters),
 * patients, orders, samples, results, billing, inventory.
 *
 * Usage (from repo root):
 *   npm run seed
 *   npm run seed:sample
 *
 * Optional:
 *   SEED_PASSWORD=password123          # Apollo / City Labs / platform users
 *   SEED_DEMO_PASSWORD=DemoPass123!    # Demo Lab users (@demo.local)
 *   SEED_CLEAR=false                   # skip wipe of existing seed tenants
 */
import { env } from "../config/env";
import { ensureLabOpsSchema } from "../database/ensureLabOpsSchema";
import { runProductionSeed } from "../database/seed/runProductionSeed";
import { SEED_PASSWORD } from "../database/seed/productionSeed.constants";

const main = async (): Promise<void> => {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required. Set it in backend/.env");
  }

  const clearBeforeSeed = process.env.SEED_CLEAR !== "false";
  const password = process.env.SEED_PASSWORD ?? SEED_PASSWORD;
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? env.authSeedPassword;

  await ensureLabOpsSchema();
  await runProductionSeed({
    clearBeforeSeed,
    password,
    demoPassword,
    includeDemoTenant: true
  });

  console.log("\n────────────────────────────────────────");
  console.log(" Sample data ready — login at http://127.0.0.1:5173/login");
  console.log("────────────────────────────────────────");
  console.log(" Demo Lab (org: demo)");
  console.log(`   Password for all: ${demoPassword}`);
  console.log("   admin@demo.local | receptionist@demo.local | labtech@demo.local");
  console.log("   pathologist@demo.local | phlebo@demo.local | b2b@demo.local");
  console.log(" Apollo Pathology Labs (org: apollo)");
  console.log(`   Password for all: ${password}`);
  console.log("   manager@apollo.com | cashier@apollo.com | tech@apollo.com");
  console.log("   doctor@apollo.com | phleb@apollo.com | center1@franchisee.com");
  console.log(" Platform");
  console.log(`   admin@lis.com / ${password}`);
  console.log("────────────────────────────────────────\n");
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
