import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { AppError } from "../../common/errors/AppError";
import { auditService } from "../audit/audit.service";
import { clearRefreshTokenCookie, REFRESH_COOKIE_NAME, setRefreshTokenCookie } from "./auth.cookies";
import { loginUser, logoutUser, refreshAccessToken, registerUser, getUserById } from "./auth.service";

const bearerFromReq = (req: Request): string | null => {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice("Bearer ".length);
  return null;
};

const refreshFromReq = (req: Request): string | null => {
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE_NAME];
  if (typeof fromCookie === "string" && fromCookie.length >= 20) return fromCookie;
  const body = req.body as { refreshToken?: string };
  if (typeof body?.refreshToken === "string" && body.refreshToken.length >= 20) return body.refreshToken;
  return null;
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const result = await registerUser({ ...req.body, tenantId: req.tenantId });
    setRefreshTokenCookie(res, result.refreshToken);
    auditService.log({
      userId: result.user.id,
      tenantId: req.tenantId,
      action: "CREATE",
      entity: "User",
      entityId: result.user.id,
      metadata: { email: result.user.email, role: result.user.role }
    });
    // Do not return refresh token in JSON when cookie is set (still include for API clients that opt-in)
    res.status(HTTP_STATUS.CREATED).json({
      user: result.user,
      accessToken: result.accessToken,
      accessExpiresIn: result.accessExpiresIn,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const result = await loginUser({ ...req.body, tenantId: req.tenantId });
    setRefreshTokenCookie(res, result.refreshToken);
    auditService.log({
      userId: result.user.id,
      tenantId: req.tenantId,
      action: "LOGIN",
      entity: "User",
      entityId: result.user.id,
      metadata: { email: result.user.email }
    });
    res.status(HTTP_STATUS.OK).json({
      user: result.user,
      accessToken: result.accessToken,
      accessExpiresIn: result.accessExpiresIn,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = refreshFromReq(req);
    if (!refreshToken) {
      throw new AppError("Refresh token required", HTTP_STATUS.UNAUTHORIZED, "REFRESH_TOKEN_REQUIRED");
    }
    const tokens = await refreshAccessToken(refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    res.status(HTTP_STATUS.OK).json({
      accessToken: tokens.accessToken,
      accessExpiresIn: tokens.accessExpiresIn,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = req.authUser;
    if (!authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const stored = getUserById(authUser.userId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      user: stored
        ? {
            id: stored.id,
            tenantId: stored.tenantId,
            name: stored.name,
            email: stored.email,
            role: stored.role,
            customPermissions: stored.customPermissions,
            effectivePermissions: authUser.permissions,
            userId: stored.id
          }
        : authUser
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = req.authUser;
    if (!authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    await logoutUser(authUser.userId, {
      accessToken: bearerFromReq(req),
      refreshToken: refreshFromReq(req)
    });
    clearRefreshTokenCookie(res);
    auditService.log({
      userId: authUser.userId,
      tenantId: authUser.tenantId,
      action: "LOGOUT",
      entity: "User",
      entityId: authUser.userId
    });
    res.status(HTTP_STATUS.OK).json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
};
