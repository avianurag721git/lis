-- Production auth identity store (primary). JSON file remains a cold-start fallback/migration source.

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  custom_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  refresh_token_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_users_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_tenant ON auth_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (email);

CREATE TABLE IF NOT EXISTS operations_job_runs (
  id UUID PRIMARY KEY,
  tenant_id TEXT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('REPORT_GENERATION', 'PAYMENT_PROCESS')),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
  processed_count INT NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_job_runs_type_finished
  ON operations_job_runs (job_type, finished_at DESC);
