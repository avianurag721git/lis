import { NextFunction, Request, Response } from "express";
import { saasContextService } from "../../modules/saas/saasContext.service";

/** Attaches `req.saasContext` when `req.tenantId` is set. */
export const saasContextMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      if (!req.tenantId) {
        next();
        return;
      }
      req.saasContext = await saasContextService.loadForTenant(req.tenantId);
      next();
    } catch (err) {
      next(err as Error);
    }
  })();
};
