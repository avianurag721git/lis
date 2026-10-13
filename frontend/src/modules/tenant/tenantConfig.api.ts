import { httpClient } from "../../services/http";
import {
  TenantBootstrapResponse,
  TenantBranding,
  TenantFinance,
  TenantSettings
} from "./tenant.types";

export type UpdateTenantConfigInput = {
  name?: string;
  brandingName?: string;
  logoUrl?: string | null;
  reportTemplate?: "STANDARD" | "DETAILED";
  branding?: Partial<TenantBranding>;
  settings?: Partial<TenantSettings>;
  finance?: Partial<TenantFinance>;
};

export const tenantConfigApi = {
  async get(): Promise<TenantBootstrapResponse> {
    const { data } = await httpClient.get<TenantBootstrapResponse>("/tenants/config");
    return data;
  },

  async update(payload: UpdateTenantConfigInput): Promise<TenantBootstrapResponse> {
    const { data } = await httpClient.put<TenantBootstrapResponse>("/tenants/config", payload);
    return data;
  }
};
