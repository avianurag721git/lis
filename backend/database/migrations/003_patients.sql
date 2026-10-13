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
