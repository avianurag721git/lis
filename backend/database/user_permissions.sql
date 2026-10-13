-- Tenant-scoped user permission overrides (survives API restarts when DATABASE_URL is set)

CREATE TABLE IF NOT EXISTS tenant_user_permissions (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by_user_id TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_permissions_tenant ON tenant_user_permissions (tenant_id);
