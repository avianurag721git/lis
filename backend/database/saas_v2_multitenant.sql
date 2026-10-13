-- Multi-tenant SaaS v2: white-label branding, settings, custom domains, STARTER plan

ALTER TABLE saas_tenants ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;
ALTER TABLE saas_tenants ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{
  "logoUrl": null,
  "primaryColor": "#0b5cab",
  "secondaryColor": "#b91c1c",
  "labHeaderAddress": "",
  "nablRegNo": ""
}'::jsonb;
ALTER TABLE saas_tenants ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{
  "maxUsers": 10,
  "maxBranches": 1,
  "enabledModules": ["patients", "orders", "samples", "lab_results", "billing"]
}'::jsonb;

-- Migrate BASIC → STARTER
UPDATE saas_tenants SET plan = 'STARTER' WHERE plan = 'BASIC';
UPDATE subscriptions SET plan = 'STARTER' WHERE plan = 'BASIC';

ALTER TABLE saas_tenants DROP CONSTRAINT IF EXISTS saas_tenants_plan_check;
ALTER TABLE saas_tenants ADD CONSTRAINT saas_tenants_plan_check
  CHECK (plan IN ('STARTER', 'PRO', 'ENTERPRISE'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('STARTER', 'PRO', 'ENTERPRISE'));

CREATE INDEX IF NOT EXISTS idx_saas_tenants_custom_domain ON saas_tenants (LOWER(custom_domain))
  WHERE custom_domain IS NOT NULL;

ALTER TABLE saas_tenants DROP CONSTRAINT IF EXISTS saas_tenants_subscription_status_check;
ALTER TABLE saas_tenants ADD CONSTRAINT saas_tenants_subscription_status_check
  CHECK (subscription_status IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'SUSPENDED'));
CREATE TABLE IF NOT EXISTS tenant_usage_metrics (
  tenant_id TEXT PRIMARY KEY REFERENCES saas_tenants(id) ON DELETE CASCADE,
  active_users INT NOT NULL DEFAULT 0,
  sample_volume_month INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
