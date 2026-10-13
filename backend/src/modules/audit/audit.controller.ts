import { NextFunction, Request, Response } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AppError } from "../../common/errors/AppError";
import { auditService } from "./audit.service";
import { AuditAction } from "./audit.types";

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant required", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    // Immutable trail is read-only; SUPER_ADMIN sees all filters, TENANT_ADMIN scoped to tenant
    const query = req.query as Record<string, string | undefined>;
    const page = Number(query.page ?? 1) || 1;
    const limit = Math.min(Number(query.limit ?? 50) || 50, 200);
    const listInput: Parameters<typeof auditService.list>[0] = {
      tenantId: req.tenantId,
      page,
      limit
    };
    if (query.startDate) listInput.startDate = query.startDate;
    if (query.endDate) listInput.endDate = query.endDate;
    if (query.userId) listInput.userId = query.userId;
    if (query.action) listInput.action = query.action as AuditAction;
    if (query.entity) listInput.entity = query.entity;
    if (query.search) listInput.search = query.search;

    const result = await auditService.list(listInput);
    res.status(HTTP_STATUS.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/** Explicitly reject any mutation attempt on audit logs. */
export const rejectAuditMutation = (_req: Request, _res: Response, next: NextFunction): void => {
  next(
    new AppError(
      "Audit logs are immutable and cannot be modified or deleted (HIPAA)",
      HTTP_STATUS.METHOD_NOT_ALLOWED,
      "AUDIT_IMMUTABLE"
    )
  );
};
