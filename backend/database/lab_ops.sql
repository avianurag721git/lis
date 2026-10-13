-- Patient / Order / Sample logistics (Code128 barcodes, collection, transit, lab receive)

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

-- Patients: UHID aliases patient_code; ensure mobile search-friendly phone
ALTER TABLE patients ADD COLUMN IF NOT EXISTS uhid TEXT;
UPDATE patients SET uhid = patient_code WHERE uhid IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_tenant_uhid ON patients (tenant_id, uhid);

-- Test catalog pricing + tube metadata for sample auto-generation
ALTER TABLE tests ADD COLUMN IF NOT EXISTS price_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS sample_type TEXT NOT NULL DEFAULT 'BLOOD';
ALTER TABLE tests ADD COLUMN IF NOT EXISTS tube_color TEXT NOT NULL DEFAULT 'PURPLE';

CREATE TABLE IF NOT EXISTS test_packages (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NULL,
  price_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS test_package_items (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  package_id UUID NOT NULL REFERENCES test_packages(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, package_id, test_id)
);

CREATE TABLE IF NOT EXISTS order_bookings (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id),
  collection_type TEXT NOT NULL CHECK (collection_type IN ('WALK_IN', 'HOME_COLLECTION', 'B2B_FRANCHISEE')),
  franchisee_id TEXT NULL,
  subtotal_minor BIGINT NOT NULL,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  net_amount_minor BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_order_bookings_tenant_created ON order_bookings (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_bookings_patient ON order_bookings (tenant_id, patient_id);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('TEST', 'PACKAGE')),
  test_id UUID NULL REFERENCES tests(id),
  package_id UUID NULL REFERENCES test_packages(id),
  name TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS samples (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  barcode TEXT NOT NULL,
  sample_type TEXT NOT NULL,
  tube_color TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_COLLECTION'
    CHECK (status IN ('PENDING_COLLECTION', 'COLLECTED', 'IN_TRANSIT', 'RECEIVED_IN_LAB', 'REJECTED')),
  collected_at TIMESTAMPTZ NULL,
  collected_by_user_id TEXT NULL,
  temperature_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_at TIMESTAMPTZ NULL,
  received_by_user_id TEXT NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_samples_tenant_status ON samples (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_order ON samples (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_samples_barcode ON samples (barcode);
