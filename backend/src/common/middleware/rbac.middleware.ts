import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { UserRole } from "../../modules/auth/auth.types";
import { normalizeRole } from "../../modules/auth/permissions";

export const authorize = (...roles: UserRole[]) => {
  const allowed = new Set(roles.map((r) => normalizeRole(r)));

  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.authUser?.role;
    if (!role) {
      next(new AppError("Forbidden", HTTP_STATUS.FORBIDDEN, "FORBIDDEN"));
      return;
    }
    const normalized = normalizeRole(role);
    if (normalized === "SUPER_ADMIN" || normalized === "LAB_MANAGER") {
      next();
      return;
    }
    if (!allowed.has(normalized)) {
      next(new AppError("Forbidden", HTTP_STATUS.FORBIDDEN, "FORBIDDEN"));
      return;
    }
    next();
  };
};
