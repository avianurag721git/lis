import { z } from "zod";
import { AUDIT_ACTIONS } from "./audit.types";

export const listAuditLogsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    userId: z.string().optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    entity: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});
