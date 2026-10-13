-- Patient national ID / Aadhaar / SSN encrypted at rest (AES-256-GCM)

ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id_hash TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id_type TEXT NULL
  CHECK (national_id_type IS NULL OR national_id_type IN ('AADHAAR', 'SSN', 'PASSPORT', 'OTHER'));

CREATE INDEX IF NOT EXISTS idx_patients_national_id_hash
  ON patients (tenant_id, national_id_hash)
  WHERE national_id_hash IS NOT NULL;
