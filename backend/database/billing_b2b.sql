-- Cashier billing, B2B franchisee wallet, referral doctor support

ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS referred_doctor TEXT NULL;
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE order_bookings DROP CONSTRAINT IF EXISTS order_bookings_payment_status_check;
ALTER TABLE order_bookings ADD CONSTRAINT order_bookings_payment_status_check
  CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'WALLET_SETTLED'));
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 18;
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS invoice_id UUID NULL;

CREATE TABLE IF NOT EXISTS cashier_invoices (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  patient_id UUID NOT NULL,
  patient_name TEXT NOT NULL,
  patient_gstin TEXT NULL,
  lab_gstin TEXT NOT NULL DEFAULT '27AABCT1332L000',
  subtotal_minor BIGINT NOT NULL,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_minor BIGINT NOT NULL,
  cgst_minor BIGINT NOT NULL DEFAULT 0,
  sgst_minor BIGINT NOT NULL DEFAULT 0,
  igst_minor BIGINT NOT NULL DEFAULT 0,
  tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 18,
  net_amount_minor BIGINT NOT NULL,
  paid_amount_minor BIGINT NOT NULL DEFAULT 0,
  due_amount_minor BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'PENDING_APPROVAL')),
  discount_status TEXT NOT NULL DEFAULT 'APPROVED'
    CHECK (discount_status IN ('APPROVED', 'PENDING_APPROVAL', 'REJECTED')),
  requested_discount_minor BIGINT NOT NULL DEFAULT 0,
  discount_request_note TEXT NULL,
  discount_authorized_by TEXT NULL,
  discount_authorizer_role TEXT NULL,
  file_path TEXT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS cashier_payments (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES cashier_invoices(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('CASH', 'UPI', 'CARD', 'TPA', 'ONLINE')),
  tpa_insurer TEXT NULL,
  tpa_claim_id TEXT NULL,
  transaction_reference TEXT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED', 'PENDING')),
  collected_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashier_payments_invoice ON cashier_payments (invoice_id);

CREATE TABLE IF NOT EXISTS b2b_franchisees (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  wallet_balance_minor BIGINT NOT NULL DEFAULT 0,
  credit_limit_minor BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS b2b_prices (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  franchisee_id UUID NOT NULL REFERENCES b2b_franchisees(id) ON DELETE CASCADE,
  test_id UUID NOT NULL,
  price_minor BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, franchisee_id, test_id)
);

CREATE TABLE IF NOT EXISTS b2b_package_prices (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  franchisee_id UUID NOT NULL REFERENCES b2b_franchisees(id) ON DELETE CASCADE,
  package_id UUID NOT NULL,
  price_minor BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, franchisee_id, package_id)
);

CREATE TABLE IF NOT EXISTS b2b_wallet_transactions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  franchisee_id UUID NOT NULL REFERENCES b2b_franchisees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('RECHARGE', 'CREDIT', 'DEBIT', 'ADJUSTMENT', 'REFUND')),
  amount_minor BIGINT NOT NULL,
  balance_after_minor BIGINT NOT NULL,
  order_id UUID NULL,
  gateway TEXT NULL,
  gateway_ref TEXT NULL,
  note TEXT NULL,
  created_by_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_wallet_franchisee ON b2b_wallet_transactions (tenant_id, franchisee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_doctors (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT NULL,
  phone TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);
