import { NextFunction, Request, Response } from "express";
import { FeatureKey } from "../../modules/saas/saas.types";

export const requireFeature = (feature: FeatureKey) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // This project does not use plan-based feature gating: everything is accessible to every tenant.
    // Keep the middleware in place so route wiring stays stable, but always allow.
    void feature;
    next();
    return;

    // (Plan/feature gating disabled)
  };
};
