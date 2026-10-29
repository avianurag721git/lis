import { db } from "../postgres";
import { seedLog } from "./seedLogger";
import { APOLLO_TENANT_ID, CITYLABS_TENANT_ID, DEMO_TENANT_ID } from "./productionSeed.constants";

const SEED_TENANTS = [APOLLO_TENANT_ID, CITYLABS_TENANT_ID, DEMO_TENANT_ID];

/** Delete tenant-scoped transactional data (preserves saas_tenants rows). */
export const clearProductionSeedData = async (): Promise<void> => {
  seedLog.header("Clearing existing seed data");
  await db.transaction(async (client) => {
    const tables = [
      "panic_alerts",
      "lab_result_entries",
      "lab_results",
      "reagent_deductions",
      "qc_holds",
      "control_sample_results",
      "cashier_payments",
      "cashier_invoices",
      "order_reports",
      "report_distributions",
      "report_magic_links",
      "report_template_items",
      "home_collection_trips",
      "queue_tokens",
      "samples",
      "order_items",
      "b2b_wallet_transactions",
      "b2b_prices",
      "b2b_package_prices",
      "ledger_entries",
      "refunds",
      "payment_transactions",
      "invoices",
      "idempotency_keys",
      "purchase_orders",
      "background_jobs",
      "operations_job_runs",
      "tenant_user_permissions",
      "order_bookings",
      "patients",
      "test_package_items",
      "test_packages",
      "test_parameter_assignments",
      "parameter_normal_ranges",
      "parameters",
      "tests",
      "departments",
      "reagents",
      "pathologist_profiles",
      "b2b_franchisees",
      "lab_instruments",
      "referral_doctors"
    ];

    for (const tenantId of SEED_TENANTS) {
      for (const table of tables) {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      }
      await client.query(`DELETE FROM subscriptions WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM tenant_usage_metrics WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM whatsapp_sessions WHERE tenant_id = $1`, [tenantId]);
      seedLog.step(`Cleared tenant`, tenantId);
    }
  });
};
