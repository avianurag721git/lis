import { logger } from "../../common/logger/logger";
import { db } from "../../database/postgres";
import { paymentService } from "../payment/application/payment.service";
import { jobsRepository } from "./jobs.repository";
import { BackgroundJob, PaymentReverifyPayload } from "./jobs.types";

const isUndefinedTableError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "42P01";

const BATCH = 20;

const backoffSeconds = (attempts: number): number => Math.min(2 ** Math.max(0, attempts - 1) * 60, 24 * 60 * 60);

const isPaymentReverifyPayload = (p: Record<string, unknown>): p is PaymentReverifyPayload =>
  typeof p.gatewayOrderId === "string" && typeof p.tenantId === "string";

async function runPaymentReverify(job: BackgroundJob): Promise<void> {
  if (!isPaymentReverifyPayload(job.payload)) {
    await db.transaction(async (client) => {
      await jobsRepository.markFailed(job.id, "Invalid PAYMENT_REVERIFY payload", backoffSeconds(job.attempts), client);
    });
    return;
  }
  try {
    await paymentService.verifyPayment({
      tenantId: job.payload.tenantId,
      userId: "SYSTEM_JOB_RETRY",
      gatewayOrderId: job.payload.gatewayOrderId,
      paymentIntentId: job.payload.gatewayOrderId,
      idempotencyKey: `job:${job.id}:${job.attempts}`
    });
    await db.transaction(async (client) => {
      await jobsRepository.markSucceeded(job.id, client);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown job error";
    await db.transaction(async (client) => {
      await jobsRepository.markFailed(job.id, message, backoffSeconds(job.attempts), client);
    });
  }
}

export const jobsService = {
  async processDueJobs(): Promise<{ processed: number }> {
    let jobs: BackgroundJob[];
    try {
      jobs = await db.transaction(async (client) => jobsRepository.claimDueJobs(BATCH, client));
    } catch (err: unknown) {
      if (isUndefinedTableError(err)) {
        logger.warn(
          { err },
          "background_jobs table missing; run backend/database/billing.sql on Postgres (or recreate the DB volume for docker-compose init)"
        );
        return { processed: 0 };
      }
      throw err;
    }
    for (const job of jobs) {
      if (job.jobType === "PAYMENT_REVERIFY") {
        await runPaymentReverify(job);
      } else {
        await db.transaction(async (client) => {
          await jobsRepository.markFailed(
            job.id,
            `Unsupported job type: ${job.jobType}`,
            backoffSeconds(job.attempts),
            client
          );
        });
      }
    }
    return { processed: jobs.length };
  }
};
