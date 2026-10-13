const TENANT_KEY = "dlms_tenant_id";

let tenantIdMemory: string | null = localStorage.getItem(TENANT_KEY);

export const tenantService = {
  setTenantId(tenantId: string): void {
    tenantIdMemory = tenantId.trim();
    localStorage.setItem(TENANT_KEY, tenantIdMemory);
  },
  getTenantId(): string | null {
    return tenantIdMemory;
  },
  clear(): void {
    tenantIdMemory = null;
    localStorage.removeItem(TENANT_KEY);
  }
};
