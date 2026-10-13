-- Discount approval + CREDIT wallet type alias

ALTER TABLE cashier_invoices DROP CONSTRAINT IF EXISTS cashier_invoices_status_check;
ALTER TABLE cashier_invoices ADD CONSTRAINT cashier_invoices_status_check
  CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'PENDING_APPROVAL'));

ALTER TABLE cashier_invoices ADD COLUMN IF NOT EXISTS discount_status TEXT NOT NULL DEFAULT 'APPROVED'
  CHECK (discount_status IN ('APPROVED', 'PENDING_APPROVAL', 'REJECTED'));
ALTER TABLE cashier_invoices ADD COLUMN IF NOT EXISTS requested_discount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE cashier_invoices ADD COLUMN IF NOT EXISTS discount_request_note TEXT NULL;

-- Allow CREDIT as synonym type for wallet (alongside RECHARGE)
ALTER TABLE b2b_wallet_transactions DROP CONSTRAINT IF EXISTS b2b_wallet_transactions_type_check;
ALTER TABLE b2b_wallet_transactions ADD CONSTRAINT b2b_wallet_transactions_type_check
  CHECK (type IN ('RECHARGE', 'CREDIT', 'DEBIT', 'ADJUSTMENT', 'REFUND'));
