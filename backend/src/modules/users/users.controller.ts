import { NextFunction, Request, Response } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { usersService } from "./users.service";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const listTenantUsersHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Tenant required" });
      return;
    }
    ok(res, { users: usersService.listTenantStaff(req.tenantId) });
  } catch (err) {
    next(err);
  }
};

export const patchUserPermissionsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Tenant required" });
      return;
    }
    const user = await usersService.updatePermissions({
      tenantId: req.tenantId,
      targetUserId: req.params.userId as string,
      permissions: req.body.permissions,
      modifiedByUserId: req.authUser.userId
    });
    ok(res, { user });
  } catch (err) {
    next(err);
  }
};

export const getRoleDefaultsHandler = (req: Request, res: Response, next: NextFunction): void => {
  try {
    ok(res, { role: req.params.role, permissions: usersService.roleDefaults(req.params.role as string) });
  } catch (err) {
    next(err);
  }
};
