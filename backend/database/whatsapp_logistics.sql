-- WhatsApp bot sessions + home collection logistics / GPS tracking

ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS collection_address TEXT NULL;
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS preferred_collection_time TIMESTAMPTZ NULL;
ALTER TABLE order_bookings ADD COLUMN IF NOT EXISTS collection_notes TEXT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'MENU',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS home_collection_trips (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES order_bookings(id) ON DELETE CASCADE,
  phlebotomist_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  destination_address TEXT NULL,
  destination_lat DOUBLE PRECISION NULL,
  destination_lng DOUBLE PRECISION NULL,
  last_lat DOUBLE PRECISION NULL,
  last_lng DOUBLE PRECISION NULL,
  last_location_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_home_collection_trips_order ON home_collection_trips (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_home_collection_trips_active ON home_collection_trips (tenant_id, status) WHERE status = 'ACTIVE';
