-- Enterprise referral doctor master (extends billing_b2b.sql baseline)
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS doctor_code TEXT NULL;
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS clinic_name TEXT NULL;
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NULL;
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0;
ALTER TABLE referral_doctors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE referral_doctors
SET doctor_code = 'DOC-' || LPAD(SUBSTRING(REPLACE(id::text, '-', ''), 1, 3), 3, '0')
WHERE doctor_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_doctors_tenant_code
  ON referral_doctors (tenant_id, doctor_code)
  WHERE doctor_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_doctors_search
  ON referral_doctors (tenant_id, is_active, usage_count DESC, name ASC);

ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS referral_doctor_id UUID NULL;
