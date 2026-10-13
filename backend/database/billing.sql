CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  total_amount_minor BIGINT NOT NULL,
  paid_amount_minor BIGINT NOT NULL,
  due_amount_minor BIGINT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional patient registry (for UI lookup / registration).
-- Billing keeps `invoices.patient_id` as free-form text for backwards compatibility.
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NULL,
  gender TEXT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
  age_years INT NULL CHECK (age_years >= 0 AND age_years <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, patient_code)
);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_name ON patients (tenant_id, name);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount_minor BIGINT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  transaction_reference TEXT NULL,
  gateway_order_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transaction_reference
  ON payment_transactions(transaction_reference)
  WHERE transaction_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_gateway_order
  ON payment_transactions(gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  reason TEXT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_tenant_invoice ON refunds (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_refunds_transaction ON refunds (transaction_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
  refund_id UUID NULL REFERENCES refunds(id),
  account_code TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent payment capture posting (one DEBIT + one CREDIT line per transaction)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_payment_line
  ON ledger_entries (transaction_id, account_code, direction)
  WHERE refund_id IS NULL;

-- Idempotent refund reversal posting (one DEBIT + one CREDIT line per refund)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_refund_line
  ON ledger_entries (refund_id, account_code, direction)
  WHERE refund_id IS NOT NULL;

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
