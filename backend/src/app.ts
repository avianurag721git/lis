import cors from "cors";
import cookieParser from "cookie-parser";
import express, { Request, Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { HTTP_STATUS } from "./common/constants/httpStatus";
import { errorHandler } from "./common/middleware/errorHandler";
import { subdomainTenantMiddleware } from "./common/middleware/subdomain.middleware";
import { saasContextMiddleware } from "./common/middleware/saasContext.middleware";
import { tenantContext } from "./common/middleware/tenant.middleware";
import { apiRateLimiter } from "./common/middleware/rateLimit.middleware";
import { logger } from "./common/logger/logger";
import { env } from "./config/env";
import { analyticsRouter } from "./modules/analytics/analytics.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { operationsRouter } from "./modules/operations/operations.routes";
import { invoiceRouter } from "./modules/payment/interfaces/http/invoice.routes";
import { paymentRouter, paymentWebhookRouter } from "./modules/payment/interfaces/http/payment.routes";
import { refundRouter } from "./modules/payment/interfaces/http/refund.routes";
import { reportRouter } from "./modules/report/report.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { saasAdminRouter } from "./modules/saas-admin/saasAdmin.routes";
import { tenantRouter } from "./modules/tenant/tenant.routes";
import { usersRouter } from "./modules/users/users.routes";
import { patientsRouter } from "./modules/patients/patients.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { samplesRouter } from "./modules/samples/samples.routes";
import { labResultsRouter } from "./modules/lab-results/labResult.routes";
import { nablReportsRouter } from "./modules/pdf-engine/nablReports.routes";
import { cashierRouter } from "./modules/cashier/cashier.routes";
import { billingRouter } from "./modules/billing/billing.routes";
import { b2bRouter, b2bWalletWebhookRouter } from "./modules/b2b/b2b.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { pathologistRouter } from "./modules/pathologist/pathologist.routes";
import { aiPathologistRouter } from "./modules/ai-pathologist/aiPathologist.routes";
import { hl7AstmRouter } from "./modules/hl7-astm";
import { verifyOrderReport } from "./modules/pdf-engine/nablReports.controller";
import { validate } from "./common/middleware/validate.middleware";
import { z } from "zod";
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes";
import { logisticsRouter, logisticsPublicRouter } from "./modules/logistics/logistics.routes";
import { ocrRouter } from "./modules/ocr/ocr.routes";
import { kioskPublicRouter, kioskRouter } from "./modules/kiosk/kiosk.routes";
import { referralDoctorsRouter } from "./modules/referral-doctors/referralDoctors.routes";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", ...env.corsOrigins],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    frameguard: { action: "deny" },
    hsts: env.nodeEnv === "production" ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: "no-referrer" },
    noSniff: true,
    xssFilter: true
  })
);

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true
  })
);
app.use(cookieParser());
app.use("/payments", paymentWebhookRouter);
app.use("/api/b2b/wallet", b2bWalletWebhookRouter);
app.use(express.json({ limit: "3mb" }));
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }
      return "info";
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        tenantId: (req as express.Request).tenantId
      })
    }
  })
);
app.use(subdomainTenantMiddleware);
app.use(tenantContext);
app.use(saasContextMiddleware);
app.use(apiRateLimiter);

app.get("/", (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({ message: "Diagnostic Lab API" });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/tenants", tenantRouter);
app.use("/saas-admin", saasAdminRouter);
app.use("/api/saas-admin", saasAdminRouter);
app.use("/audit-logs", auditRouter);
app.use("/analytics", analyticsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/users", usersRouter);
app.use("/api/users", usersRouter);
app.use("/operations", operationsRouter);
app.use("/invoices", invoiceRouter);
app.use("/payments", paymentRouter);
app.use("/refunds", refundRouter);
app.use("/reports", reportRouter);
app.use("/api/reports", nablReportsRouter);
app.get(
  "/verify/:orderId",
  validate(
    z.object({
      params: z.object({ orderId: z.string().uuid() })
    })
  ),
  verifyOrderReport
);
app.use("/api/logistics", logisticsPublicRouter);
app.use("/api/kiosk", kioskPublicRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/logistics", logisticsRouter);
app.use("/api/ocr", ocrRouter);
app.use("/api/kiosk", kioskRouter);
app.use("/catalog", catalogRouter);
app.use("/patients", patientsRouter);
app.use("/orders", ordersRouter);
app.use("/samples", samplesRouter);
app.use("/lab-results", labResultsRouter);
app.use("/cashier", cashierRouter);
app.use("/billing", billingRouter);
app.use("/b2b", b2bRouter);
app.use("/inventory", inventoryRouter);
app.use("/pathologist", pathologistRouter);
app.use("/api/pathologist", pathologistRouter);
app.use("/api/ai", aiPathologistRouter);
app.use("/ai", aiPathologistRouter);
app.use("/hl7-astm", hl7AstmRouter);
app.use("/api/hl7-astm", hl7AstmRouter);
// Aliases matching `/api/*` contracts
app.use("/api/patients", patientsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/samples", samplesRouter);
app.use("/api/lab-results", labResultsRouter);
app.use("/api/cashier", cashierRouter);
app.use("/api/billing", billingRouter);
app.use("/api/b2b", b2bRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/referral-doctors", referralDoctorsRouter);
app.use("/api/referral-doctors", referralDoctorsRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);

export { app };
