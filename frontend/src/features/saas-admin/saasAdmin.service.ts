import { httpClient } from "../../services/http";

export type SaasOverview = {
  totalTenants: number;
  activeTenants: number;
  mrrUsd: number;
  totalActiveUsers: number;
  totalSampleVolumeMonth: number;
};

export type TenantAdminRow = {
  id: string;
  name: string;
  subdomain: string;
  customDomain: string | null;
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  subscriptionStatus: string;
  activeUsers: number;
  sampleVolumeMonth: number;
  mrrUsd: number;
  enabledModules: string[];
};

export type OnboardPayload = {
  labName: string;
  subdomain: string;
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  labAddress?: string;
  nablRegNo?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export const saasAdminApi = {
  async getOverview(): Promise<SaasOverview> {
    const { data } = await httpClient.get<{ overview: SaasOverview }>("/saas-admin/overview");
    return data.overview;
  },

  async listTenants(): Promise<TenantAdminRow[]> {
    const { data } = await httpClient.get<{ tenants: TenantAdminRow[] }>("/saas-admin/tenants");
    return data.tenants;
  },

  async createTenant(body: { name: string; subdomain: string; plan: TenantAdminRow["plan"] }) {
    const { data } = await httpClient.post("/saas-admin/tenants", body);
    return data;
  },

  async updateTenant(tenantId: string, body: Record<string, unknown>) {
    const { data } = await httpClient.patch(`/saas-admin/tenants/${tenantId}`, body);
    return data;
  },

  async checkSubdomain(subdomain: string): Promise<boolean> {
    const { data } = await httpClient.get<{ available: boolean }>("/saas-admin/subdomain-check", {
      params: { subdomain }
    });
    return data.available;
  },

  async onboard(payload: OnboardPayload) {
    const { data } = await httpClient.post("/saas-admin/onboard", payload);
    return data as {
      tenant: { id: string; name: string; subdomain: string; loginUrl: string };
      accessToken: string;
      refreshToken: string;
    };
  }
};
