import { auditRepository } from "./audit.repository";
import { AuditAction, AuditLog } from "./audit.types";

type AuditInput = {
  userId: string | null;
  tenantId: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

type ListInput = {
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

const SENSITIVE_KEYS = new Set(["password", "token", "refreshToken", "accessToken", "authorization"]);

const sanitizeObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, val]) => {
      if (SENSITIVE_KEYS.has(key)) {
        return acc;
      }
      acc[key] = sanitizeObject(val);
      return acc;
    }, {});
  }
  return value;
};

export const auditService = {
  log(input: AuditInput): AuditLog {
    return auditRepository.create({
      userId: input.userId,
      tenantId: input.tenantId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: (sanitizeObject(input.metadata ?? {}) as Record<string, unknown>) ?? {}
    });
  },
  list(input: ListInput): { items: AuditLog[]; total: number; page: number; limit: number } | Promise<{ items: AuditLog[]; total: number; page: number; limit: number }> {
    return Promise.resolve(auditRepository.list(input)).then((result) => ({
      items: result.items,
      total: result.total,
      page: input.page,
      limit: input.limit
    }));
  }
};
