CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  last_error TEXT NULL,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, job_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_due ON background_jobs (next_run_at, status)
  WHERE status IN ('PENDING', 'FAILED');
