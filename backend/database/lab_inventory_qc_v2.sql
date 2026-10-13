-- Inventory/QC enhancements: batch fields, LEVEL_1–3, instruments, purchase orders

ALTER TABLE reagents ADD COLUMN IF NOT EXISTS tests_per_vial INTEGER NULL;
ALTER TABLE reagents ADD COLUMN IF NOT EXISTS unit_cost_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE reagents ADD COLUMN IF NOT EXISTS supplier_name TEXT NULL;
ALTER TABLE reagents ADD COLUMN IF NOT EXISTS branch_id TEXT NULL;

UPDATE reagents SET tests_per_vial = vial_capacity WHERE tests_per_vial IS NULL;

ALTER TABLE control_sample_results DROP CONSTRAINT IF EXISTS control_sample_results_control_level_check;
ALTER TABLE control_sample_results ADD CONSTRAINT control_sample_results_control_level_check
  CHECK (control_level IN (
    'NORMAL', 'HIGH',
    'LEVEL_1_NORMAL', 'LEVEL_2_HIGH', 'LEVEL_3_LOW'
  ));

ALTER TABLE control_sample_results ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PASSED'
  CHECK (status IN ('PASSED', 'WARNING', 'REJECTED'));
ALTER TABLE control_sample_results ADD COLUMN IF NOT EXISTS violated_rule TEXT NULL;

CREATE TABLE IF NOT EXISTS lab_instruments (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'IN_CALIBRATION'
    CHECK (status IN ('IN_CALIBRATION', 'OUT_OF_CALIBRATION')),
  out_of_calibration_reason TEXT NULL,
  last_calibration_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  po_number TEXT NOT NULL,
  reagent_id UUID NULL REFERENCES reagents(id) ON DELETE SET NULL,
  reagent_name TEXT NOT NULL,
  lot_number TEXT NULL,
  quantity_vials INTEGER NOT NULL DEFAULT 1,
  unit_cost_minor BIGINT NOT NULL DEFAULT 0,
  supplier_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED')),
  notes TEXT NULL,
  created_by_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_instruments_status ON lab_instruments (tenant_id, status);
