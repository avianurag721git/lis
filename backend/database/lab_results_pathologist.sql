-- Pathologist verification + NABL report artifacts

ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS lab_results_status_check;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_status_check
  CHECK (status IN (
    'PENDING',
    'DRAFT',
    'TECHNICIAN_APPROVED',
    'PATHOLOGIST_APPROVED',
    'PATHOLOGIST_VERIFIED',
    'RERUN_REQUESTED'
  ));

ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pathologist_user_id TEXT NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pathologist_signature_url TEXT NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pathologist_license TEXT NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pathologist_name TEXT NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS rerun_instructions TEXT NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS referred_doctor TEXT NULL;

ALTER TABLE parameters ADD COLUMN IF NOT EXISTS methodology TEXT NULL;

CREATE TABLE IF NOT EXISTS pathologist_profiles (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  medical_license_number TEXT NOT NULL,
  digital_signature_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS order_reports (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  verify_token TEXT NOT NULL,
  report_url TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_reports_token ON order_reports (verify_token);

CREATE TABLE IF NOT EXISTS report_distributions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP', 'SMS', 'EMAIL', 'WEBHOOK')),
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
