import { AuthTokens } from "./auth.types";

const ACCESS_TOKEN_KEY = "dlms_access_token";

/** Access in sessionStorage; refresh kept in memory only (HttpOnly cookie is primary). */
let accessTokenMemory: string | null = sessionStorage.getItem(ACCESS_TOKEN_KEY);
let refreshTokenMemory: string | null = null;

export const tokenService = {
  getAccessToken(): string | null {
    return accessTokenMemory;
  },
  getRefreshToken(): string | null {
    return refreshTokenMemory;
  },
  setTokens(tokens: AuthTokens): void {
    accessTokenMemory = tokens.accessToken;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      refreshTokenMemory = tokens.refreshToken;
    }
  },
  setAccessToken(accessToken: string): void {
    accessTokenMemory = accessToken;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  },
  clear(): void {
    accessTokenMemory = null;
    refreshTokenMemory = null;
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem("dlms_access_token");
    localStorage.removeItem("dlms_refresh_token");
  }
};
