/**
 * Production-grade database seeder — populates all 12 entities for end-to-end QA.
 * Run: npm run seed --workspace backend  (or npm run seed from repo root)
 *
 * Canonical path in this monorepo: backend/src/scripts/seedDatabase.ts
 * Alias path requested: apps/api/src/scripts/seedDatabase.ts
 */
import { env } from "../config/env";
import { ensureLabOpsSchema } from "../database/ensureLabOpsSchema";
import { runProductionSeed } from "../database/seed/runProductionSeed";
import { SEED_PASSWORD } from "../database/seed/productionSeed.constants";

const main = async (): Promise<void> => {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required to run the seed script.");
  }

  await ensureLabOpsSchema();
  await runProductionSeed({
    clearBeforeSeed: true,
    password: process.env.SEED_PASSWORD ?? SEED_PASSWORD
  });
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
