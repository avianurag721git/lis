-- Optional columns for production seed data (blood group, clinical notes, retail B2B list prices)

ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_group TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_notes TEXT NULL;

ALTER TABLE tests ADD COLUMN IF NOT EXISTS b2b_price_minor BIGINT NULL;
