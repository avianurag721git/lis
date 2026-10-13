import { httpClient } from "../../services/http";
import { AuditAction, AuditLog } from "./audit.types";

export type AuditLogFilters = {
  startDate?: string;
  endDate?: string;
  userId?: string;
  action?: AuditAction;
  entity?: string;
  search?: string;
  page?: number;
  limit?: number;
};

type ApiOk<T> = { success: true; data: T };

export const getAuditLogs = async (
  filters: AuditLogFilters
): Promise<{ items: AuditLog[]; total: number }> => {
  const { data } = await httpClient.get<ApiOk<{ items: AuditLog[]; total: number }>>("/audit-logs", {
    params: filters
  });
  return data.data;
};
