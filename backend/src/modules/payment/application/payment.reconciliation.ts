import cron from "node-cron";
import { logger } from "../../../common/logger/logger";
import { env } from "../../../config/env";
import { jobsService } from "../../jobs/jobs.service";
import { paymentService } from "./payment.service";

/** Programmatic entrypoint: pending gateway rows → Stripe verify → local status/invoice/ledger updates. */
export const reconcilePendingPaymentsWithStripe = (): ReturnType<typeof paymentService.reconcilePendingPaymentsWithStripe> =>
  paymentService.reconcilePendingPaymentsWithStripe();

export const startPaymentReconciliationJob = (): void => {
  cron.schedule(env.paymentReconciliationCron, async () => {
    try {
      const stats = await reconcilePendingPaymentsWithStripe();
      if (stats.scanned > 0) {
        console.info(
          `Payment reconciliation: scanned=${stats.scanned} succeeded=${stats.succeeded} failed=${stats.failed} skipped=${stats.skipped} errors=${stats.errors}`
        );
      }
    } catch (error) {
      console.error("Payment reconciliation failed", error);
    }
  });
};

export const startFailedJobsRetryJob = (): void => {
  cron.schedule(env.jobRetryCron, async () => {
    try {
      const { processed } = await jobsService.processDueJobs();
      if (processed > 0) {
        logger.info({ job: "failed_jobs_retry", processed }, "Background jobs processed");
      }
    } catch (error) {
      logger.error({ err: error, job: "failed_jobs_retry" }, "Background job worker failed");
    }
  });
};
