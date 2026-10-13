-- Hyper-accessible features: BYOD kiosk queue tokens + magic report links

CREATE TABLE IF NOT EXISTS queue_tokens (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_label TEXT NOT NULL,
  queue_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'CALLED', 'SERVED', 'CANCELLED')),
  mobile TEXT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID')),
  called_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_tokens_tenant_status ON queue_tokens (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_tokens_label ON queue_tokens (tenant_id, token_label);

CREATE TABLE IF NOT EXISTS report_magic_links (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  use_count INT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_magic_links_order ON report_magic_links (tenant_id, order_id);
