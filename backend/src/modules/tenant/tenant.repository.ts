import { randomUUID } from "crypto";
import { Tenant } from "./tenant.types";

type CreateTenantInput = {
  id?: string;
  name: string;
  subdomain: string;
  configuration: Tenant["configuration"];
};

const tenantsById = new Map<string, Tenant>();
const tenantIdBySubdomain = new Map<string, string>();

export const tenantRepository = {
  create(input: CreateTenantInput): Tenant {
    const tenant: Tenant = {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      subdomain: input.subdomain.toLowerCase(),
      configuration: input.configuration,
      createdAt: new Date().toISOString()
    };
    tenantsById.set(tenant.id, tenant);
    tenantIdBySubdomain.set(tenant.subdomain, tenant.id);
    return tenant;
  },
  findById(tenantId: string): Tenant | null {
    return tenantsById.get(tenantId) ?? null;
  },
  findBySubdomain(subdomain: string): Tenant | null {
    const id = tenantIdBySubdomain.get(subdomain.toLowerCase());
    return id ? tenantsById.get(id) ?? null : null;
  },
  listAll(): Tenant[] {
    return Array.from(tenantsById.values());
  }
};
