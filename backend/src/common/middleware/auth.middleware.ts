import { NextFunction, Request, Response } from "express";
import { HTTP_STATUS } from "../constants/httpStatus";
import { AppError } from "../errors/AppError";
import { assertJwtTenantMatchesHost } from "../../modules/saas/hostTenant.guard";
import { assertAccessTokenNotRevoked, getUserById } from "../../modules/auth/auth.service";
import { resolveEffectivePermissions } from "../../modules/auth/permissions";

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  void (async () => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      next(new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED"));
      return;
    }

    const token = authHeader.slice("Bearer ".length);

    try {
      const decoded = await assertAccessTokenNotRevoked(token);
      const stored = getUserById(decoded.sub);
      const permissions = stored ? resolveEffectivePermissions(stored) : decoded.permissions ?? [];

      req.authUser = {
        userId: decoded.sub,
        email: decoded.email,
        role: stored?.role ?? decoded.role,
        tenantId: decoded.tenantId,
        permissions,
        ...(stored?.name ? { name: stored.name } : {})
      };
      const role = stored?.role ?? decoded.role;
      const headerTenant = req.header("x-tenant-id")?.trim();
      if (role === "SUPER_ADMIN" && headerTenant) {
        // Platform super admins may operate inside any lab tenant they switch to.
        req.tenantId = headerTenant;
        next();
        return;
      }
      req.tenantId = decoded.tenantId;
      await assertJwtTenantMatchesHost(req, decoded.tenantId);
      next();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError("Invalid or expired token", HTTP_STATUS.UNAUTHORIZED, "INVALID_TOKEN"));
    }
  })();
};
