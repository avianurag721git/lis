import { db } from "../../database/postgres";
import { env } from "../../config/env";
import type { Permission } from "../auth/permissions";

export const userPermissionsRepository = {
  async loadAllForTenant(tenantId: string): Promise<Map<string, Permission[]>> {
    if (!env.databaseUrl) return new Map();
    const result = await db.query(
      `SELECT user_id, permissions FROM tenant_user_permissions WHERE tenant_id = $1`,
      [tenantId]
    );
    const map = new Map<string, Permission[]>();
    for (const row of result.rows) {
      map.set(row.user_id as string, (row.permissions as Permission[]) ?? []);
    }
    return map;
  },

  async upsert(tenantId: string, userId: string, permissions: Permission[], updatedByUserId: string): Promise<void> {
    if (!env.databaseUrl) return;
    await db.query(
      `INSERT INTO tenant_user_permissions (tenant_id, user_id, permissions, updated_by_user_id, updated_at)
       VALUES ($1,$2,$3::jsonb,$4,NOW())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         permissions = EXCLUDED.permissions,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()`,
      [tenantId, userId, JSON.stringify(permissions), updatedByUserId]
    );
  }
};
