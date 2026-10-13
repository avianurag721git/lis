-- Patient lifecycle: report passcode magic links + dispatch tracking
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS report_passcode TEXT NULL;
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS report_dispatched_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_bookings_report_passcode
  ON order_bookings (tenant_id, report_passcode)
  WHERE report_passcode IS NOT NULL;
