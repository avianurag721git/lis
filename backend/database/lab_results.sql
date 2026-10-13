-- Lab result entry + calculation engine

ALTER TABLE parameters ADD COLUMN IF NOT EXISTS formula TEXT NULL;
ALTER TABLE parameters ADD COLUMN IF NOT EXISTS formula_alias TEXT NULL;
ALTER TABLE parameters ADD COLUMN IF NOT EXISTS critical_low NUMERIC NULL;
ALTER TABLE parameters ADD COLUMN IF NOT EXISTS critical_high NUMERIC NULL;

CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  test_id UUID NOT NULL REFERENCES tests(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DRAFT', 'TECHNICIAN_APPROVED', 'PATHOLOGIST_APPROVED')),
  technician_note TEXT NULL,
  approved_by_user_id TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_results_pending
  ON lab_results (tenant_id, status, department_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lab_result_entries (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lab_result_id UUID NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES parameters(id),
  value_numeric NUMERIC NULL,
  value_text TEXT NULL,
  is_calculated BOOLEAN NOT NULL DEFAULT FALSE,
  is_abnormal BOOLEAN NOT NULL DEFAULT FALSE,
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  flag TEXT NULL,
  reference_min NUMERIC NULL,
  reference_max NUMERIC NULL,
  delta_previous_value NUMERIC NULL,
  delta_change_percentage NUMERIC NULL,
  delta_flag TEXT NULL,
  critical_ack_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lab_result_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_result_entries_param
  ON lab_result_entries (tenant_id, parameter_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS panic_alerts (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lab_result_id UUID NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES parameters(id),
  value_numeric NUMERIC NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panic_alerts_tenant ON panic_alerts (tenant_id, created_at DESC);
