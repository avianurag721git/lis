import { randomUUID } from "crypto";
import { logger } from "../../common/logger/logger";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { nablPdfEngine } from "../pdf-engine/nablPdf.engine";
import { paymentService } from "../payment/application/payment.service";

export interface OperationsService {
  triggerReportGeneration(input?: {
    tenantId?: string;
    userId?: string;
  }): Promise<{ message: string; reportsGenerated: number; mode: "live" | "mock"; detail?: string }>;
  triggerPaymentProcess(): Promise<{
    message: string;
    paymentsProcessed: number;
    mode: "live" | "mock";
    detail?: string;
  }>;
  getOperationsStatus(): Promise<{
    lastReportRun: string | null;
    lastPaymentRun: string | null;
    pendingReports: number;
    pendingPayments: number;
    stripeConfigured: boolean;
  }>;
}

const recordJobRun = async (input: {
  tenantId?: string | null;
  jobType: "REPORT_GENERATION" | "PAYMENT_PROCESS";
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  processedCount: number;
  detail: Record<string, unknown>;
}): Promise<void> => {
  if (!env.databaseUrl) return;
  try {
    await db.query(
      `INSERT INTO operations_job_runs (id, tenant_id, job_type, status, processed_count, detail, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW(),NOW())`,
      [
        randomUUID(),
        input.tenantId ?? null,
        input.jobType,
        input.status,
        input.processedCount,
        JSON.stringify(input.detail)
      ]
    );
  } catch (err) {
    logger.warn({ err }, "Failed to persist operations_job_runs row");
  }
};

class OperationsServiceImpl implements OperationsService {
  async triggerReportGeneration(input?: {
    tenantId?: string;
    userId?: string;
  }): Promise<{ message: string; reportsGenerated: number; mode: "live" | "mock"; detail?: string }> {
    if (!env.databaseUrl) {
      return {
        message: "Database not configured — report job not run",
        reportsGenerated: 0,
        mode: "mock",
        detail: "DATABASE_URL missing"
      };
    }

    const tenantFilter = input?.tenantId;
    const userId = input?.userId ?? "SYSTEM_OPERATIONS";

    // Verified pathologist results with no order_reports row yet
    const pending = await db.query(
      `SELECT DISTINCT lr.tenant_id, lr.order_id
       FROM lab_results lr
       LEFT JOIN order_reports r
         ON r.tenant_id = lr.tenant_id AND r.order_id = lr.order_id
       WHERE lr.status IN ('PATHOLOGIST_VERIFIED', 'VERIFIED')
         AND r.id IS NULL
         ${tenantFilter ? "AND lr.tenant_id = $1" : ""}
       LIMIT 50`,
      tenantFilter ? [tenantFilter] : []
    );

    let generated = 0;
    const errors: string[] = [];
    for (const row of pending.rows) {
      try {
        await nablPdfEngine.generateForOrder({
          tenantId: row.tenant_id as string,
          userId,
          orderId: row.order_id as string
        });
        generated += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "generate failed");
      }
    }

    await recordJobRun({
      tenantId: tenantFilter ?? null,
      jobType: "REPORT_GENERATION",
      status: errors.length === 0 ? "SUCCESS" : generated > 0 ? "PARTIAL" : "FAILED",
      processedCount: generated,
      detail: { candidates: pending.rows.length, errors: errors.slice(0, 5) }
    });

    logger.info({ generated, candidates: pending.rows.length }, "Report generation job completed");

    return {
      message:
        pending.rows.length === 0
          ? "No verified orders missing PDFs"
          : `Generated ${generated} of ${pending.rows.length} pending report(s)`,
      reportsGenerated: generated,
      mode: "live",
      ...(errors.length ? { detail: errors[0] } : {})
    };
  }

  async triggerPaymentProcess(): Promise<{
    message: string;
    paymentsProcessed: number;
    mode: "live" | "mock";
    detail?: string;
  }> {
    if (!env.stripeSecretKey) {
      await recordJobRun({
        jobType: "PAYMENT_PROCESS",
        status: "SUCCESS",
        processedCount: 0,
        detail: { mock: true, reason: "STRIPE_SECRET_KEY not configured" }
      });
      return {
        message: "Stripe not configured — payment reconciliation skipped (mock)",
        paymentsProcessed: 0,
        mode: "mock",
        detail: "Set STRIPE_SECRET_KEY for live reconciliation"
      };
    }

    const stats = await paymentService.reconcilePendingPaymentsWithStripe();
    await recordJobRun({
      jobType: "PAYMENT_PROCESS",
      status: stats.errors > 0 ? "PARTIAL" : "SUCCESS",
      processedCount: stats.succeeded,
      detail: stats
    });

    return {
      message: `Reconciled ${stats.scanned} pending payment(s): ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`,
      paymentsProcessed: stats.succeeded,
      mode: "live"
    };
  }

  async getOperationsStatus(): Promise<{
    lastReportRun: string | null;
    lastPaymentRun: string | null;
    pendingReports: number;
    pendingPayments: number;
    stripeConfigured: boolean;
  }> {
    let lastReportRun: string | null = null;
    let lastPaymentRun: string | null = null;
    let pendingReports = 0;
    let pendingPayments = 0;

    if (env.databaseUrl) {
      try {
        const runs = await db.query(
          `SELECT DISTINCT ON (job_type) job_type, finished_at
           FROM operations_job_runs
           ORDER BY job_type, finished_at DESC`
        );
        for (const row of runs.rows) {
          const iso =
            row.finished_at instanceof Date
              ? row.finished_at.toISOString()
              : String(row.finished_at);
          if (row.job_type === "REPORT_GENERATION") lastReportRun = iso;
          if (row.job_type === "PAYMENT_PROCESS") lastPaymentRun = iso;
        }
      } catch {
        /* table may not exist yet on first boot race */
      }

      try {
        const reports = await db.query(
          `SELECT COUNT(*)::int AS c
           FROM (
             SELECT DISTINCT lr.tenant_id, lr.order_id
             FROM lab_results lr
             LEFT JOIN order_reports r
               ON r.tenant_id = lr.tenant_id AND r.order_id = lr.order_id
             WHERE lr.status IN ('PATHOLOGIST_VERIFIED', 'VERIFIED')
               AND r.id IS NULL
           ) pending`
        );
        pendingReports = reports.rows[0]?.c ?? 0;
      } catch {
        pendingReports = 0;
      }

      try {
        const payments = await db.query(
          `SELECT COUNT(*)::int AS c
           FROM payment_transactions
           WHERE method IN ('ONLINE', 'ONLINE_GATEWAY')
             AND status = 'PENDING'
             AND created_at < NOW() - INTERVAL '15 minutes'`
        );
        pendingPayments = payments.rows[0]?.c ?? 0;
      } catch {
        pendingPayments = 0;
      }
    }

    return {
      lastReportRun,
      lastPaymentRun,
      pendingReports,
      pendingPayments,
      stripeConfigured: Boolean(env.stripeSecretKey)
    };
  }
}

export const operationsService = new OperationsServiceImpl();
