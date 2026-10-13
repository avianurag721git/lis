-- Multi-tenant SaaS registry (optional when DATABASE_URL is set; falls back to in-memory tenant repo otherwise)

CREATE TABLE IF NOT EXISTS saas_tenants (
  id TEXT PRIMARY KEY,
  subdomain TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'STARTER' CHECK (plan IN ('STARTER', 'PRO', 'ENTERPRISE')),
  subscription_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (subscription_status IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING')),
  feature_flags JSONB NOT NULL DEFAULT '{}',
  configuration JSONB NOT NULL DEFAULT '{"brandingName":"","logoUrl":null,"reportTemplate":"STANDARD","finance":{"defaultGstPercent":18,"labGstin":"27AABCT1332L000","currencyCode":"INR","invoicePrefix":"INV","placeOfSupply":""}}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_tenants_subdomain ON saas_tenants (subdomain);

-- Default tenant for local/Docker (matches AUTH_SEED_TENANT_ID default `demo`). Idempotent for re-runs.
INSERT INTO saas_tenants (id, subdomain, name, plan, subscription_status, feature_flags, configuration)
VALUES (
  'demo',
  'demo',
  'Demo Lab',
  'STARTER',
  'ACTIVE',
  '{}'::jsonb,
  '{"brandingName":"Demo Lab","logoUrl":null,"reportTemplate":"STANDARD","finance":{"defaultGstPercent":18,"labGstin":"27AABCT1332L000","currencyCode":"INR","invoicePrefix":"INV","placeOfSupply":""}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Ensure finance block exists on older tenants (idempotent)
UPDATE saas_tenants
SET configuration = configuration || jsonb_build_object(
  'finance',
  COALESCE(configuration->'finance', '{}'::jsonb) || jsonb_build_object(
    'defaultGstPercent', COALESCE((configuration->'finance'->>'defaultGstPercent')::numeric, 18),
    'labGstin', COALESCE(configuration->'finance'->>'labGstin', '27AABCT1332L000'),
    'currencyCode', COALESCE(configuration->'finance'->>'currencyCode', 'INR'),
    'invoicePrefix', COALESCE(configuration->'finance'->>'invoicePrefix', 'INV'),
    'placeOfSupply', COALESCE(configuration->'finance'->>'placeOfSupply', '')
  )
)
WHERE configuration->'finance' IS NULL OR configuration->'finance'->>'defaultGstPercent' IS NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('STARTER', 'PRO', 'ENTERPRISE')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_created ON subscriptions (tenant_id, created_at DESC);
