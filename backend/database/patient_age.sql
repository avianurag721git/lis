-- Pediatric / neonatal age: DOB is source of truth; age_value + unit for walk-in when DOB unknown.
-- Canonical age_days supports infants (days/months) instead of collapsing everyone under 1 year to 0.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_value INT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_unit TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_days INT NULL;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_age_unit_check;
ALTER TABLE patients ADD CONSTRAINT patients_age_unit_check
  CHECK (age_unit IS NULL OR age_unit IN ('DAYS', 'MONTHS', 'YEARS'));

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_age_days_check;
ALTER TABLE patients ADD CONSTRAINT patients_age_days_check
  CHECK (age_days IS NULL OR (age_days >= 0 AND age_days <= 43800));

UPDATE patients
SET
  age_unit = COALESCE(age_unit, 'YEARS'),
  age_value = COALESCE(age_value, age_years),
  age_days = COALESCE(age_days, CASE WHEN age_years IS NULL THEN NULL ELSE age_years * 365 END)
WHERE age_years IS NOT NULL AND (age_days IS NULL OR age_value IS NULL OR age_unit IS NULL);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_dob ON patients (tenant_id, date_of_birth);
