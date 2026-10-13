import dotenv from "dotenv";
import { readFileSync } from "fs";
import { existsSync } from "fs";

dotenv.config();

type NodeEnv = "development" | "test" | "production";

const parseNodeEnv = (value: string | undefined): NodeEnv => {
  if (value === "production" || value === "test") {
    return value;
  }
  return "development";
};

const parsePort = (value: string | undefined): number => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 5000;
};

/** Read from Docker secret file if _FILE variant exists, otherwise return the value directly */
const readSecretOrValue = (value: string | undefined, fileVar: string | undefined): string => {
  if (fileVar && existsSync(fileVar)) {
    try {
      return readFileSync(fileVar, "utf-8").trim();
    } catch (err) {
      console.error(`Failed to read secret file ${fileVar}:`, err);
      process.exit(1);
    }
  }
  return value ?? "";
};

/** Comma-separated in `CORS_ORIGIN`. Default allows both Vite dev URLs (localhost vs 127.0.0.1 are different origins). */
const parseCorsOrigins = (): string[] => {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

export const env = {
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  port: parsePort(process.env.PORT),
  corsOrigins: parseCorsOrigins(),
  jwtAccessSecret: readSecretOrValue(process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_SECRET_FILE) || "dev_access_secret",
  jwtRefreshSecret: readSecretOrValue(process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_SECRET_FILE) || "dev_refresh_secret",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  stripeSecretKey: readSecretOrValue(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_SECRET_KEY_FILE),
  stripeWebhookSecret: readSecretOrValue(process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_FILE),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** Optional MongoDB for tenant-scoped Mongoose document models (Patient, Sample, …). */
  mongodbUri: process.env.MONGODB_URI ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  paymentReconciliationCron: process.env.PAYMENT_RECONCILIATION_CRON ?? "*/10 * * * *",
  jobRetryCron: process.env.JOB_RETRY_CRON ?? "*/5 * * * *",
  analyticsCacheTtlSec: Number(process.env.ANALYTICS_CACHE_TTL_SEC ?? "60") || 60,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? String(15 * 60 * 1000)) || 15 * 60 * 1000,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? "400") || 400,
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? String(15 * 60 * 1000)) || 15 * 60 * 1000,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? "30") || 30,
  /** e.g. `example.com` — used to parse `tenant.example.com` → tenant slug `tenant` */
  saasRootDomain: process.env.SAAS_ROOT_DOMAIN ?? "localhost",
  /** Comma-separated subdomains that never map to a tenant (api, www, …) */
  saasIgnoredSubdomains: (process.env.SAAS_IGNORE_SUBDOMAINS ?? "www,api")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL ?? "info",
  /**
   * When true, creates a demo user on startup and exposes the demo tenant in `GET /tenants`.
   * Defaults to on in non-production when unset; set `AUTH_SEED_DEMO_USER=false` to disable.
   */
  authSeedDemoUser: (() => {
    const v = process.env.AUTH_SEED_DEMO_USER;
    if (v === "true") {
      return true;
    }
    if (v === "false") {
      return false;
    }
    return parseNodeEnv(process.env.NODE_ENV) !== "production";
  })(),
  reportEncryptionKey: readSecretOrValue(process.env.REPORT_ENCRYPTION_KEY, process.env.REPORT_ENCRYPTION_KEY_FILE) || "diaglab-dev-report-key-32chars!!",
  publicVerifyBaseUrl: process.env.PUBLIC_VERIFY_BASE_URL ?? "https://yourlab.com/verify",
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000",
  /** Frontend origin for patient magic links (WhatsApp report-view). */
  publicWebBaseUrl: process.env.PUBLIC_WEB_BASE_URL ?? process.env.CORS_ORIGIN?.split(",")[0]?.trim() ?? "http://localhost:5173",
  reportWebhookUrl: process.env.REPORT_DISTRIBUTION_WEBHOOK_URL ?? "",
  inventoryAlertEmail: process.env.INVENTORY_ALERT_EMAIL ?? "",
  inventoryAlertWebhookUrl: process.env.INVENTORY_ALERT_WEBHOOK_URL ?? "",
  /** Promised TAT in hours for SLA compliance (sample collect → pathologist verify). */
  tatSlaHours: Number(process.env.TAT_SLA_HOURS ?? "24") || 24,
  authSeedTenantId: process.env.AUTH_SEED_TENANT_ID ?? "demo",
  authSeedEmail: process.env.AUTH_SEED_EMAIL ?? "admin@demo.local",
  authSeedPassword: process.env.AUTH_SEED_PASSWORD ?? "DemoPass123!",
  /** TCP port for HL7/ASTM analyzers (Sysmex, Roche, Mindray). Default 5000. */
  analyzerTcpPort: Number(process.env.ANALYZER_TCP_PORT ?? "5000") || 5000,
  analyzerGatewayEnabled: process.env.ANALYZER_GATEWAY_ENABLED !== "false",
  analyzerDefaultTenantId:
    process.env.ANALYZER_DEFAULT_TENANT_ID ?? process.env.AUTH_SEED_TENANT_ID ?? "demo",
  analyzerSystemUserId: process.env.ANALYZER_SYSTEM_USER_ID ?? "ANALYZER_GATEWAY",
  /** PHI / Aadhaar-SSN field encryption (AES-256-GCM). Falls back to report key. */
  phiEncryptionKey:
    readSecretOrValue(process.env.PHI_ENCRYPTION_KEY, process.env.PHI_ENCRYPTION_KEY_FILE) ||
    readSecretOrValue(process.env.REPORT_ENCRYPTION_KEY, process.env.REPORT_ENCRYPTION_KEY_FILE) ||
    "diaglab-dev-phi-key-32chars!!!!",
  cookieSecure: process.env.COOKIE_SECURE === "true" || parseNodeEnv(process.env.NODE_ENV) === "production",
  cookieSameSite: ((): "strict" | "lax" | "none" => {
    const v = (process.env.COOKIE_SAME_SITE ?? (parseNodeEnv(process.env.NODE_ENV) === "production" ? "none" : "lax")).toLowerCase();
    if (v === "strict" || v === "none" || v === "lax") return v;
    return "lax";
  })(),
  cookieDomain: process.env.COOKIE_DOMAIN ?? "",
  refreshCookieMaxAgeMs: Number(process.env.REFRESH_COOKIE_MAX_AGE_MS ?? String(7 * 24 * 60 * 60 * 1000)),
  /** Optional S3 private report bucket (HIPAA). When unset, local encrypted FS + Redis-signed URLs. */
  awsRegion: process.env.AWS_REGION ?? "ap-south-1",
  awsS3Bucket: process.env.AWS_S3_BUCKET ?? "",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  reportPresignExpiresSec: Number(process.env.REPORT_PRESIGN_EXPIRES_SEC ?? "900") || 900,
  cookiePath: process.env.COOKIE_PATH ?? "/",
  /** AI Co-Pathologist: openai | anthropic | local | mock (auto-detect from keys if unset) */
  aiProvider: process.env.AI_PROVIDER ?? "",
  aiEnabled: process.env.AI_ENABLED !== "false",
  aiModel: process.env.AI_MODEL ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** OpenAI-compatible local endpoint e.g. http://127.0.0.1:11434/v1 (Ollama) */
  aiLocalBaseUrl: process.env.AI_LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1",
  /** Include Smart Patient Summary page in NABL PDF reports */
  aiPatientSummaryInPdf: process.env.AI_PATIENT_SUMMARY_IN_PDF !== "false",
  /** Default language for PDF patient summary: en | hi */
  aiPatientSummaryLanguage: (process.env.AI_PATIENT_SUMMARY_LANGUAGE === "hi" ? "hi" : "en") as "en" | "hi",
  /** Meta WhatsApp Cloud API */
  whatsappCloudToken: process.env.WHATSAPP_CLOUD_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "diaglab_whatsapp_verify",
  whatsappDefaultTenantId: process.env.WHATSAPP_DEFAULT_TENANT_ID ?? process.env.AUTH_SEED_TENANT_ID ?? "demo",
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
  /** BYOD kiosk UPI VPA for QR/deep links */
  kioskUpiVpa: process.env.KIOSK_UPI_VPA ?? "diaglab@upi",
  /** Public smart report magic link base e.g. https://yourlab.com/r */
  publicSmartReportBaseUrl: process.env.PUBLIC_SMART_REPORT_BASE_URL ?? "http://localhost:5173/r"
} as const;
