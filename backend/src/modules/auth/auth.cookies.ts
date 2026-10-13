import { CookieOptions, Response } from "express";
import { env } from "../../config/env";

export const REFRESH_COOKIE_NAME = "dlms_refresh_token";

export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  maxAge: env.refreshCookieMaxAgeMs,
  path: env.cookiePath,
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
});

export const clearRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  path: env.cookiePath,
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
});

export const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
};
