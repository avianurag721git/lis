import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./common/logger/logger";
import { connectMongo } from "./database/mongo";
import {
  initAuthUserCache,
  seedDemoAuthUserIfEnabled,
  seedSuperAdminIfEnabled,
  loadTenantPermissionOverrides
} from "./modules/auth/auth.service";
import { seedProductionAuthUsers } from "./modules/auth/productionUsers.seed";
import {
  startFailedJobsRetryJob,
  startPaymentReconciliationJob
} from "./modules/payment/application/payment.reconciliation";
import { ensureLabOpsSchema } from "./database/ensureLabOpsSchema";
import { initRealtime } from "./realtime/sampleEvents";
import { startAnalyzerSocketServer, stopAnalyzerSocketServer } from "./modules/hl7-astm";
import { validateEnv } from "./config/validateEnv";

// Validate environment before starting
validateEnv();

const server = app.listen(env.port, () => {
  logger.info({ port: env.port, nodeEnv: env.nodeEnv }, "API server listening");
  void (async () => {
    try {
      await ensureLabOpsSchema();
      await initAuthUserCache();
    } catch (err) {
      logger.error({ err }, "ensureLabOpsSchema / auth hydrate failed");
    }
    try {
      await connectMongo();
    } catch (err) {
      logger.warn({ err }, "MongoDB optional connect skipped");
    }
    try {
      await seedDemoAuthUserIfEnabled();
      await seedSuperAdminIfEnabled();
      // Always seed Apollo role accounts so login org "apollo" works even when AUTH_SEED_TENANT_ID=demo.
      await seedProductionAuthUsers();
      await loadTenantPermissionOverrides("apollo");
    } catch (err) {
      logger.error({ err }, "AUTH seed failed");
    }
  })();
});

initRealtime(server);
startAnalyzerSocketServer();

startPaymentReconciliationJob();
startFailedJobsRetryJob();

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "Graceful shutdown requested");
  void stopAnalyzerSocketServer().finally(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
