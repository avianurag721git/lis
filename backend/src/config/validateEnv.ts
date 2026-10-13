import { env } from "./env";
import { logger } from "../common/logger/logger";

type ValidationError = {
  field: string;
  reason: string;
  severity: "critical" | "warning";
};

const weakSecretPatterns = [
  /^dev_/i,
  /^test_/i,
  /^demo_/i,
  /^change/,
  /^replace/,
  /^example/,
  /^placeholder/i,
  /^diaglab-dev/i,
  /^.*32chars.*$/i,
  /^(weak|insecure|default)$/i
];

const isWeakSecret = (value: string): boolean => {
  if (!value || value.length < 32) return true;
  return weakSecretPatterns.some((pattern) => pattern.test(value));
};

const isWeakDbPassword = (value: string): boolean => {
  if (!value || value.length < 12) return true;
  const weakPasswords = ["password", "postgres", "admin", "root", "diaglab", "123456", "qwerty"];
  return weakPasswords.includes(value.toLowerCase());
};

const validateProductionEnv = (): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (env.nodeEnv !== "production") {
    return errors; // Only validate in production
  }

  // JWT Secrets
  if (isWeakSecret(env.jwtAccessSecret)) {
    errors.push({
      field: "JWT_ACCESS_SECRET",
      reason: "Weak or default JWT access secret detected. Generate a strong secret (32+ chars) using: openssl rand -base64 32",
      severity: "critical"
    });
  }

  if (isWeakSecret(env.jwtRefreshSecret)) {
    errors.push({
      field: "JWT_REFRESH_SECRET",
      reason: "Weak or default JWT refresh secret detected. Generate a strong secret (32+ chars) using: openssl rand -base64 32",
      severity: "critical"
    });
  }

  // Encryption Keys
  if (isWeakSecret(env.reportEncryptionKey)) {
    errors.push({
      field: "REPORT_ENCRYPTION_KEY",
      reason: "Weak or default report encryption key detected. Generate a strong secret (32+ chars) using: openssl rand -base64 32",
      severity: "critical"
    });
  }

  if (isWeakSecret(env.phiEncryptionKey)) {
    errors.push({
      field: "PHI_ENCRYPTION_KEY",
      reason: "Weak or default PHI encryption key detected. Generate a strong secret (32+ chars) using: openssl rand -base64 32",
      severity: "critical"
    });
  }

  // Database URL
  if (!env.databaseUrl) {
    errors.push({
      field: "DATABASE_URL",
      reason: "DATABASE_URL is required in production",
      severity: "critical"
    });
  } else {
    const dbMatch = env.databaseUrl.match(/:([^:@]+)@/);
    if (dbMatch && dbMatch[1] && isWeakDbPassword(dbMatch[1])) {
      errors.push({
        field: "DATABASE_URL",
        reason: "Weak database password detected. Use a strong password (12+ chars) from secrets management",
        severity: "critical"
      });
    }
  }

  // Redis URL
  if (!env.redisUrl) {
    errors.push({
      field: "REDIS_URL",
      reason: "REDIS_URL is required in production",
      severity: "critical"
    });
  }

  // CORS Origins
  if (env.corsOrigins.length === 0) {
    errors.push({
      field: "CORS_ORIGIN",
      reason: "CORS_ORIGIN is required in production",
      severity: "critical"
    });
  }

  // Public URLs
  if (!env.publicVerifyBaseUrl || env.publicVerifyBaseUrl.includes("yourlab.com")) {
    errors.push({
      field: "PUBLIC_VERIFY_BASE_URL",
      reason: "PUBLIC_VERIFY_BASE_URL must be set to actual production domain",
      severity: "critical"
    });
  }

  if (!env.publicApiBaseUrl || env.publicApiBaseUrl.includes("127.0.0.1")) {
    errors.push({
      field: "PUBLIC_API_BASE_URL",
      reason: "PUBLIC_API_BASE_URL must be set to actual production API domain",
      severity: "critical"
    });
  }

  // Optional integrations (warnings only)
  if (!env.stripeSecretKey && env.stripeWebhookSecret) {
    errors.push({
      field: "STRIPE_SECRET_KEY",
      reason: "STRIPE_WEBHOOK_SECRET is set but STRIPE_SECRET_KEY is missing",
      severity: "warning"
    });
  }

  if (!env.twilioAccountSid && env.twilioAuthToken) {
    errors.push({
      field: "TWILIO_ACCOUNT_SID",
      reason: "TWILIO_AUTH_TOKEN is set but TWILIO_ACCOUNT_SID is missing",
      severity: "warning"
    });
  }

  // Demo user should be disabled in production
  if (env.authSeedDemoUser) {
    errors.push({
      field: "AUTH_SEED_DEMO_USER",
      reason: "Demo user seeding is enabled in production. Set AUTH_SEED_DEMO_USER=false",
      severity: "warning"
    });
  }

  return errors;
};

export const validateEnv = (): void => {
  const errors = validateProductionEnv();

  if (errors.length === 0) {
    logger.info("Production environment validation passed");
    return;
  }

  const critical = errors.filter((e) => e.severity === "critical");
  const warnings = errors.filter((e) => e.severity === "warning");

  if (critical.length > 0) {
    logger.error(
      {
        criticalErrors: critical.map((e) => ({ field: e.field, reason: e.reason }))
      },
      "Production environment validation failed with critical errors"
    );
    console.error("\n=== PRODUCTION CONFIGURATION ERRORS ===\n");
    critical.forEach((e) => {
      console.error(`[CRITICAL] ${e.field}: ${e.reason}`);
    });
    console.error("\nApplication cannot start in production with critical configuration errors.\n");
    process.exit(1);
  }

  if (warnings.length > 0) {
    logger.warn(
      {
        warnings: warnings.map((e) => ({ field: e.field, reason: e.reason }))
      },
      "Production environment validation passed with warnings"
    );
    console.warn("\n=== PRODUCTION CONFIGURATION WARNINGS ===\n");
    warnings.forEach((e) => {
      console.warn(`[WARNING] ${e.field}: ${e.reason}`);
    });
    console.warn("\n");
  }
};
