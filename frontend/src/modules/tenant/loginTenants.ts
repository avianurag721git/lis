import axios from "axios";
import { env } from "../../utils/env";

export type LoginTenantOption = {
  id: string;
  label: string;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Public login tenant list — no auth headers (avoids stale-token interceptor loops).
 */
export const fetchLoginTenants = async (): Promise<LoginTenantOption[]> => {
  const base = env.apiUrl;
  const url = base ? `${base}/tenants` : "/tenants";
  const { data } = await axios.get<{ tenants: LoginTenantOption[] }>(url, {
    timeout: 12000,
    withCredentials: true,
    headers: { Accept: "application/json" }
  });
  return data.tenants ?? [];
};

export const fetchLoginTenantsWithRetry = async (
  maxAttempts = 24,
  delayMs = 2500
): Promise<LoginTenantOption[]> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchLoginTenants();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
};
