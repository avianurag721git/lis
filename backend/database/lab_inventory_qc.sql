-- Reagent inventory + QC / Westgard holds

ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS lab_results_status_check;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_status_check
  CHECK (status IN (
    'PENDING',
    'PROCESSING',
    'DRAFT',
    'TECHNICIAN_APPROVED',
    'PATHOLOGIST_APPROVED',
    'PATHOLOGIST_VERIFIED',
    'RERUN_REQUESTED'
  ));

ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS reagent_lot_id UUID NULL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS qc_blocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS reagents (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  vial_capacity INTEGER NOT NULL DEFAULT 100,
  remaining_tests INTEGER NOT NULL,
  reorder_level INTEGER NOT NULL DEFAULT 20,
  test_id UUID NULL,
  department_id UUID NULL,
  instrument_code TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  low_stock_alerted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_reagents_test ON reagents (tenant_id, test_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_reagents_remaining ON reagents (tenant_id, remaining_tests);

CREATE TABLE IF NOT EXISTS reagent_deductions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reagent_id UUID NOT NULL REFERENCES reagents(id) ON DELETE CASCADE,
  lab_result_id UUID NOT NULL,
  test_id UUID NULL,
  deducted_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lab_result_id)
);

CREATE TABLE IF NOT EXISTS control_sample_results (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reagent_id UUID NULL REFERENCES reagents(id) ON DELETE SET NULL,
  test_id UUID NULL,
  instrument_code TEXT NULL,
  control_level TEXT NOT NULL CHECK (control_level IN ('NORMAL', 'HIGH')),
  parameter_name TEXT NOT NULL,
  target_mean DOUBLE PRECISION NOT NULL,
  target_sd DOUBLE PRECISION NOT NULL,
  observed_value DOUBLE PRECISION NOT NULL,
  run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  z_score DOUBLE PRECISION NULL,
  westgard_flags TEXT[] NOT NULL DEFAULT '{}',
  is_reject BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_results_param ON control_sample_results (tenant_id, parameter_name, control_level, run_date DESC);

CREATE TABLE IF NOT EXISTS qc_holds (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  westgard_rule TEXT NOT NULL,
  control_result_id UUID NULL REFERENCES control_sample_results(id) ON DELETE SET NULL,
  reagent_id UUID NULL REFERENCES reagents(id) ON DELETE SET NULL,
  test_id UUID NULL,
  instrument_code TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_holds_active ON qc_holds (tenant_id, is_active) WHERE is_active = TRUE;
