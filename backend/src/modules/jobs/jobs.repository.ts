import { randomUUID } from "crypto";
import { DbClient, db } from "../../database/postgres";
import { BackgroundJob, JobType } from "./jobs.types";

type JobRow = {
  id: string;
  job_type: string;
  dedupe_key: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: string;
  max_attempts: string;
  last_error: string | null;
  next_run_at: Date;
  created_at: Date;
  updated_at: Date;
};

const mapRow = (row: JobRow): BackgroundJob => ({
  id: row.id,
  jobType: row.job_type as JobType,
  dedupeKey: row.dedupe_key,
  tenantId: row.tenant_id,
  payload: row.payload,
  status: row.status,
  attempts: Number(row.attempts),
  maxAttempts: Number(row.max_attempts),
  lastError: row.last_error,
  nextRunAt: row.next_run_at.toISOString(),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString()
});

export const jobsRepository = {
  async enqueuePaymentReverify(input: { tenantId: string; gatewayOrderId: string }, client?: DbClient): Promise<void> {
    const q = client ?? db;
    const id = randomUUID();
    const payload = { gatewayOrderId: input.gatewayOrderId, tenantId: input.tenantId };
    await q.query(
      `INSERT INTO background_jobs (
         id, job_type, dedupe_key, tenant_id, payload, status, attempts, max_attempts, next_run_at, created_at, updated_at
       ) VALUES ($1, 'PAYMENT_REVERIFY', $2, $3, $4::jsonb, 'PENDING', 0, 8, NOW(), NOW(), NOW())
       ON CONFLICT (tenant_id, job_type, dedupe_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         status = CASE WHEN background_jobs.status = 'RUNNING' THEN background_jobs.status ELSE 'PENDING' END,
         next_run_at = CASE
           WHEN background_jobs.status = 'RUNNING' THEN background_jobs.next_run_at
           ELSE NOW()
         END,
         updated_at = NOW()`,
      [id, input.gatewayOrderId, input.tenantId, JSON.stringify(payload)]
    );
  },

  async claimDueJobs(limit: number, client: DbClient): Promise<BackgroundJob[]> {
    const result = await client.query(
      `WITH picked AS (
         SELECT id FROM background_jobs
         WHERE status IN ('PENDING', 'FAILED')
           AND attempts < max_attempts
           AND next_run_at <= NOW()
         ORDER BY next_run_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE background_jobs j
       SET status = 'RUNNING',
           attempts = j.attempts + 1,
           updated_at = NOW()
       FROM picked
       WHERE j.id = picked.id
       RETURNING j.*`,
      [limit]
    );
    return result.rows.map((r: JobRow) => mapRow(r));
  },

  async markSucceeded(jobId: string, client: DbClient): Promise<void> {
    await client.query(
      `UPDATE background_jobs SET status = 'SUCCEEDED', last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [jobId]
    );
  },

  async markFailed(jobId: string, errorMessage: string, backoffSeconds: number, client: DbClient): Promise<void> {
    await client.query(
      `UPDATE background_jobs
       SET status = 'FAILED',
           last_error = $2,
           next_run_at = NOW() + ($3::text || ' seconds')::interval,
           updated_at = NOW()
       WHERE id = $1`,
      [jobId, errorMessage.slice(0, 2000), String(backoffSeconds)]
    );
  }
};
