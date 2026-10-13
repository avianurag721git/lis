import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { HTTP_STATUS } from "../constants/httpStatus";
import { getUserById } from "../../modules/auth/auth.service";
import { hasPermission, Permission } from "../../modules/auth/permissions";

export const requirePermission = (...required: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authUser = req.authUser;
    if (!authUser) {
      next(new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED"));
      return;
    }

    const subject = {
      role: authUser.role,
      customPermissions: authUser.permissions
    };

    if (required.some((perm) => hasPermission(subject, perm))) {
      next();
      return;
    }

    next(
      new AppError("Forbidden: Insufficient permissions", HTTP_STATUS.FORBIDDEN, "INSUFFICIENT_PERMISSIONS")
    );
  };
};

/** Hydrate permissions on authUser from the in-memory user store (post-authenticate). */
export const attachUserPermissions = (req: Request, _res: Response, next: NextFunction): void => {
  const authUser = req.authUser;
  if (!authUser) {
    next();
    return;
  }
  const user = getUserById(authUser.userId);
  if (user) {
    authUser.permissions = user.customPermissions;
    authUser.role = user.role;
    authUser.name = user.name;
  }
  next();
};
