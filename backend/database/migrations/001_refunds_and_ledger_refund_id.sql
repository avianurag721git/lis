-- Run after initial billing schema if `ledger_entries` exists without `refund_id`.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  reason TEXT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_tenant_invoice ON refunds (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_refunds_transaction ON refunds (transaction_id);

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS refund_id UUID REFERENCES refunds(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_payment_line
  ON ledger_entries (transaction_id, account_code, direction)
  WHERE refund_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_refund_line
  ON ledger_entries (refund_id, account_code, direction)
  WHERE refund_id IS NOT NULL;
