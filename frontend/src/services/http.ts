import axios from "axios";
import { env } from "../utils/env";
import { tokenService } from "../modules/auth/token.service";
import { tenantService } from "../modules/tenant/tenant.service";

export const SESSION_EXPIRED_EVENT = "diaglab:session-expired";

export const httpClient = axios.create({
  baseURL: env.apiUrl,
  // Neon / cold paths can exceed 10s; billing create-invoice was aborting at exactly 10s.
  timeout: 30_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return /\/auth\/(login|register|refresh|logout)(\?|$)/.test(url);
};

const notifySessionExpired = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
};

httpClient.interceptors.request.use((config) => {
  const token = tokenService.getAccessToken();
  const tenantId = tenantService.getTenantId();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (tenantId) {
    config.headers["x-tenant-id"] = tenantId;
  }
  return config;
});

// Refresh tokens rotate on every use, so concurrent 401s must share one refresh call;
// a second parallel refresh would present an already-revoked token and end the session.
let refreshInFlight: Promise<string> | null = null;

const refreshAccessTokenOnce = (): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const tenantId = tenantService.getTenantId();
      const memoryRefresh = tokenService.getRefreshToken();
      const response = await axios.post<{ accessToken: string; refreshToken?: string }>(
        `${env.apiUrl}/auth/refresh`,
        memoryRefresh ? { refreshToken: memoryRefresh } : {},
        {
          withCredentials: true,
          ...(tenantId ? { headers: { "x-tenant-id": tenantId } } : {})
        }
      );
      tokenService.setTokens({
        accessToken: response.data.accessToken,
        ...(response.data.refreshToken ? { refreshToken: response.data.refreshToken } : {})
      });
      return response.data.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as
      | { _retry?: boolean; url?: string; headers?: Record<string, string> }
      | undefined;
    const status = error.response?.status as number | undefined;

    // Never try token refresh for login/register/refresh/logout — surface the real API error.
    if (!originalRequest || status !== 401 || originalRequest._retry || isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const accessToken = await refreshAccessTokenOnce();
      originalRequest.headers = {
        ...(originalRequest.headers ?? {}),
        Authorization: `Bearer ${accessToken}`
      };
      return httpClient(originalRequest);
    } catch {
      tokenService.clear();
      notifySessionExpired();
      // Prefer the original 401 so callers see "Invalid credentials" etc., not refresh noise.
      return Promise.reject(error);
    }
  }
);
