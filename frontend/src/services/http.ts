import axios from "axios";
import { env } from "../utils/env";
import { tokenService } from "../modules/auth/token.service";
import { tenantService } from "../modules/tenant/tenant.service";

export const SESSION_EXPIRED_EVENT = "diaglab:session-expired";

export const httpClient = axios.create({
  baseURL: env.apiUrl,
  timeout: 10000,
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
      originalRequest.headers = {
        ...(originalRequest.headers ?? {}),
        Authorization: `Bearer ${response.data.accessToken}`
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
