import { NextFunction, Request, Response } from "express";
import { auditService } from "../../modules/audit/audit.service";
import { AuditAction } from "../../modules/audit/audit.types";

export const auditTrail = (action: AuditAction, entity: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 400 && req.tenantId) {
        void Promise.resolve().then(() => {
          auditService.log({
            userId: req.authUser?.userId ?? null,
            tenantId: req.tenantId as string,
            action,
            entity,
            metadata: {
              path: req.path,
              method: req.method,
              body: req.body
            }
          });
        });
      }
    });
    next();
  };
};
