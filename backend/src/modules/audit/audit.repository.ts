import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import { AuditAction, AuditLog } from "./audit.types";

type CreateAuditLogInput = {
  userId: string | null;
  tenantId: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

type ListAuditFilters = {
  tenantId: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  action?: AuditAction;
  entity?: string;
  search?: string;
  page: number;
  limit: number;
};

/** In-memory fallback when Postgres is unavailable (still no update/delete API). */
const memoryLogs: AuditLog[] = [];

const mapRow = (r: any): AuditLog => ({
  id: r.id,
  userId: r.user_id,
  tenantId: r.tenant_id,
  action: r.action,
  entity: r.entity,
  entityId: r.entity_id,
  metadata: typeof r.metadata === "object" && r.metadata ? r.metadata : {},
  timestamp: new Date(r.created_at).toISOString()
});

export const auditRepository = {
  create(input: CreateAuditLogInput): AuditLog {
    const log: AuditLog = {
      id: randomUUID(),
      userId: input.userId,
      tenantId: input.tenantId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      metadata: input.metadata,
      timestamp: new Date().toISOString()
    };

    if (env.databaseUrl) {
      void db
        .query(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, entity_id, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [
            log.id,
            log.tenantId,
            log.userId,
            log.action,
            log.entity,
            log.entityId,
            JSON.stringify(log.metadata)
          ]
        )
        .catch((err) => {
          logger.warn({ err }, "audit_logs insert failed — memory fallback");
          memoryLogs.push(log);
        });
    } else {
      memoryLogs.push(log);
    }
    return log;
  },

  async list(filters: ListAuditFilters): Promise<{ items: AuditLog[]; total: number }> {
    if (env.databaseUrl) {
      try {
        const params: unknown[] = [filters.tenantId];
        let where = `tenant_id = $1`;
        if (filters.userId) {
          params.push(filters.userId);
          where += ` AND user_id = $${params.length}`;
        }
        if (filters.action) {
          params.push(filters.action);
          where += ` AND action = $${params.length}`;
        }
        if (filters.entity) {
          params.push(filters.entity);
          where += ` AND LOWER(entity) = LOWER($${params.length})`;
        }
        if (filters.startDate) {
          params.push(filters.startDate);
          where += ` AND created_at >= $${params.length}::timestamptz`;
        }
        if (filters.endDate) {
          params.push(filters.endDate);
          where += ` AND created_at <= $${params.length}::timestamptz`;
        }
        if (filters.search) {
          params.push(`%${filters.search}%`);
          where += ` AND (entity ILIKE $${params.length} OR COALESCE(entity_id,'') ILIKE $${params.length} OR metadata::text ILIKE $${params.length})`;
        }
        const countRes = await db.query(`SELECT COUNT(*)::int AS c FROM audit_logs WHERE ${where}`, params);
        const total = Number(countRes.rows[0]?.c ?? 0);
        const offset = (filters.page - 1) * filters.limit;
        params.push(filters.limit, offset);
        const rows = await db.query(
          `SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
        return { items: rows.rows.map(mapRow), total };
      } catch (err) {
        logger.warn({ err }, "audit_logs list failed — memory fallback");
      }
    }

    const filtered = memoryLogs.filter((log) => {
      if (log.tenantId !== filters.tenantId) return false;
      if (filters.userId && log.userId !== filters.userId) return false;
      if (filters.action && log.action !== filters.action) return false;
      if (filters.entity && log.entity.toLowerCase() !== filters.entity.toLowerCase()) return false;
      if (filters.startDate && log.timestamp < filters.startDate) return false;
      if (filters.endDate && log.timestamp > filters.endDate) return false;
      if (filters.search) {
        const text = JSON.stringify(log).toLowerCase();
        if (!text.includes(filters.search.toLowerCase())) return false;
      }
      return true;
    });
    const total = filtered.length;
    const start = (filters.page - 1) * filters.limit;
    return { items: filtered.slice(start, start + filters.limit), total };
  }
};
