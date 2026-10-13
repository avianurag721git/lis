import fs from "fs";
import path from "path";
import { db } from "./postgres";
import { env } from "../config/env";
import { logger } from "../common/logger/logger";

/** Remove `--` line comments (outside single-quoted strings). */
const stripLineComments = (sql: string): string => {
  const lines = sql.split(/\r?\n/);
  return lines
    .map((line) => {
      let out = "";
      let inSingle = false;
      for (let i = 0; i < line.length; i++) {
        if (!inSingle && line[i] === "-" && line[i + 1] === "-") {
          break;
        }
        if (line[i] === "'") {
          if (inSingle && line[i + 1] === "'") {
            out += "''";
            i += 1;
            continue;
          }
          inSingle = !inSingle;
        }
        out += line[i]!;
      }
      return out;
    })
    .join("\n");
};

/** Split SQL on `;` but keep dollar-quoted blocks (plpgsql) intact. */
export const splitSqlStatements = (sql: string): string[] => {
  const cleaned = stripLineComments(sql);
  const statements: string[] = [];
  let current = "";
  let dollarTag: string | null = null;
  let i = 0;

  while (i < cleaned.length) {
    if (dollarTag) {
      const closeIdx = cleaned.indexOf(dollarTag, i);
      if (closeIdx === -1) {
        current += cleaned.slice(i);
        break;
      }
      current += cleaned.slice(i, closeIdx + dollarTag.length);
      i = closeIdx + dollarTag.length;
      dollarTag = null;
      continue;
    }

    const rest = cleaned.slice(i);
    const dollarMatch = rest.match(/^\$[A-Za-z0-9_]*\$/);
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }

    const ch = cleaned[i]!;
    if (ch === "'") {
      current += ch;
      i += 1;
      while (i < cleaned.length) {
        current += cleaned[i]!;
        if (cleaned[i] === "'") {
          if (cleaned[i + 1] === "'") {
            current += cleaned[i + 1]!;
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0 && !trimmed.startsWith("--")) {
        statements.push(trimmed);
      }
      current = "";
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail.length > 0 && !tail.startsWith("--")) {
    statements.push(tail);
  }
  return statements;
};

const IGNORABLE_PG_CODES = new Set([
  "42710", // duplicate_object (constraint already exists)
  "42P07", // duplicate_table
  "42701" // duplicate_column
]);

const applySqlFile = async (relativePath: string, label: string): Promise<void> => {
  const sqlPath = path.join(__dirname, relativePath);
  if (!fs.existsSync(sqlPath)) {
    logger.warn({ sqlPath }, `${label} SQL file missing`);
    return;
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code && IGNORABLE_PG_CODES.has(code)) {
        continue;
      }
      logger.warn({ err, statement: statement.slice(0, 120) }, `${label} DDL statement skipped/failed`);
    }
  }
  logger.info(`${label} schema ensured`);
};

/** Idempotent column/table patches when SQL files were partially applied. */
const ensureCriticalPatches = async (): Promise<void> => {
  const patches = [
    `ALTER TABLE patients ADD COLUMN IF NOT EXISTS uhid TEXT`,
    `UPDATE patients SET uhid = patient_code WHERE uhid IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_tenant_uhid ON patients (tenant_id, uhid)`,
    `ALTER TABLE tests ADD COLUMN IF NOT EXISTS price_minor BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE tests ADD COLUMN IF NOT EXISTS sample_type TEXT NOT NULL DEFAULT 'BLOOD'`,
    `ALTER TABLE tests ADD COLUMN IF NOT EXISTS tube_color TEXT NOT NULL DEFAULT 'PURPLE'`,
    `ALTER TABLE parameters ADD COLUMN IF NOT EXISTS formula TEXT NULL`,
    `ALTER TABLE parameters ADD COLUMN IF NOT EXISTS formula_alias TEXT NULL`,
    `ALTER TABLE parameters ADD COLUMN IF NOT EXISTS analyzer_code TEXT NULL`,
    `ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL`,
    `ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_value INT NULL`,
    `ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_unit TEXT NULL`,
    `ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_days INT NULL`,
    `UPDATE saas_tenants
     SET configuration = configuration || jsonb_build_object(
       'finance',
       COALESCE(configuration->'finance', '{}'::jsonb) || jsonb_build_object(
         'defaultGstPercent', COALESCE((configuration->'finance'->>'defaultGstPercent')::numeric, 18),
         'labGstin', COALESCE(configuration->'finance'->>'labGstin', '27AABCT1332L000'),
         'currencyCode', COALESCE(configuration->'finance'->>'currencyCode', 'INR'),
         'invoicePrefix', COALESCE(configuration->'finance'->>'invoicePrefix', 'INV'),
         'placeOfSupply', COALESCE(configuration->'finance'->>'placeOfSupply', '')
       )
     )
     WHERE configuration->'finance' IS NULL OR configuration->'finance'->>'defaultGstPercent' IS NULL`,
    // Align legacy BASIC plan with STARTER (saas_v2) for volumes created before the rename
    `UPDATE saas_tenants SET plan = 'STARTER' WHERE plan = 'BASIC'`,
    `UPDATE subscriptions SET plan = 'STARTER' WHERE plan = 'BASIC'`,
    `ALTER TABLE saas_tenants DROP CONSTRAINT IF EXISTS saas_tenants_plan_check`,
    `ALTER TABLE saas_tenants ADD CONSTRAINT saas_tenants_plan_check CHECK (plan IN ('STARTER', 'PRO', 'ENTERPRISE'))`,
    `ALTER TABLE saas_tenants ALTER COLUMN plan SET DEFAULT 'STARTER'`,
    `ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check`,
    `ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('STARTER', 'PRO', 'ENTERPRISE'))`
  ];
  for (const sql of patches) {
    try {
      await db.query(sql);
    } catch (err) {
      logger.warn({ err, sql }, "critical schema patch skipped");
    }
  }
};

/**
 * Apply full DDL chain on boot so existing Docker volumes pick up
 * orders/samples/results without requiring a destructive volume wipe.
 */
export const ensureLabOpsSchema = async (): Promise<void> => {
  if (!env.databaseUrl) {
    return;
  }

  // Match docker-entrypoint-initdb.d order
  await applySqlFile("../../database/billing.sql", "billing");
  await applySqlFile("../../database/saas.sql", "saas");
  await applySqlFile("../../database/saas_v2_multitenant.sql", "saas_v2");
  await applySqlFile("../../database/report_templates.sql", "report_templates");
  await applySqlFile("../../database/lab_ops.sql", "lab_ops");
  await applySqlFile("../../database/lab_results.sql", "lab_results");
  await applySqlFile("../../database/lab_results_pathologist.sql", "lab_results_pathologist");
  await applySqlFile("../../database/billing_b2b.sql", "billing_b2b");
  await applySqlFile("../../database/lab_inventory_qc.sql", "lab_inventory_qc");
  await applySqlFile("../../database/lab_inventory_qc_v2.sql", "lab_inventory_qc_v2");
  await applySqlFile("../../database/lab_pathologist_reject.sql", "lab_pathologist_reject");
  await applySqlFile("../../database/billing_discount_approval.sql", "billing_discount_approval");
  await applySqlFile("../../database/hl7_astm.sql", "hl7_astm");
  await applySqlFile("../../database/patient_phi.sql", "patient_phi");
  await applySqlFile("../../database/audit_immutable.sql", "audit_immutable");
  await applySqlFile("../../database/whatsapp_logistics.sql", "whatsapp_logistics");
  await applySqlFile("../../database/test_studio.sql", "test_studio");
  await applySqlFile("../../database/hyper_accessible.sql", "hyper_accessible");
  await applySqlFile("../../database/patient_age.sql", "patient_age");
  await applySqlFile("../../database/seed_extensions.sql", "seed_extensions");

  await applySqlFile("../../database/user_permissions.sql", "user_permissions");
  await applySqlFile("../../database/order_lifecycle.sql", "order_lifecycle");
  await applySqlFile("../../database/referral_doctors_v2.sql", "referral_doctors_v2");
  await applySqlFile("../../database/auth_users.sql", "auth_users");

  await ensureCriticalPatches();
};
