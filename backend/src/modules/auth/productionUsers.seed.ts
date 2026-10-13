import { upsertSeedUser, upsertSuperAdminUser } from "./auth.service";
import type { RegisterRole } from "./auth.types";
import { APOLLO_TENANT_ID, PLATFORM_TENANT_ID, SEED_PASSWORD } from "../../database/seed/productionSeed.constants";

export type ProductionUserKey =
  | "superAdmin"
  | "manager"
  | "cashier"
  | "phlebotomist"
  | "labTech"
  | "pathologist"
  | "b2bFranchisee"
  | "patient";

export type ProductionUserIds = Record<ProductionUserKey, string>;

const PRODUCTION_USERS: Array<{
  key: ProductionUserKey;
  tenantId: string;
  name: string;
  email: string;
  role: RegisterRole;
}> = [
  { key: "manager", tenantId: APOLLO_TENANT_ID, name: "Apollo Lab Manager", email: "manager@apollo.com", role: "LAB_MANAGER" },
  { key: "cashier", tenantId: APOLLO_TENANT_ID, name: "Apollo Receptionist", email: "cashier@apollo.com", role: "RECEPTIONIST" },
  { key: "phlebotomist", tenantId: APOLLO_TENANT_ID, name: "Apollo Phlebotomist", email: "phleb@apollo.com", role: "PHLEBOTOMIST" },
  { key: "labTech", tenantId: APOLLO_TENANT_ID, name: "Apollo Lab Technician", email: "tech@apollo.com", role: "LAB_TECH" },
  { key: "pathologist", tenantId: APOLLO_TENANT_ID, name: "Dr. Apollo Pathologist", email: "doctor@apollo.com", role: "PATHOLOGIST" },
  { key: "b2bFranchisee", tenantId: APOLLO_TENANT_ID, name: "Care Diagnostics Franchisee", email: "center1@franchisee.com", role: "B2B_FRANCHISEE" },
  { key: "patient", tenantId: APOLLO_TENANT_ID, name: "Patient Portal User", email: "patient@gmail.com", role: "PATIENT" }
];

/** Register all production QA users in the in-memory auth store (default password: password123). */
export const seedProductionAuthUsers = async (password: string = SEED_PASSWORD): Promise<ProductionUserIds> => {
  const ids = {} as ProductionUserIds;

  const superAdmin = await upsertSuperAdminUser({
    email: "admin@lis.com",
    password,
    name: "Platform Super Admin",
    tenantId: PLATFORM_TENANT_ID
  });
  ids.superAdmin = superAdmin.id;

  for (const spec of PRODUCTION_USERS) {
    const user = await upsertSeedUser({
      tenantId: spec.tenantId,
      name: spec.name,
      email: spec.email,
      password,
      role: spec.role
    });
    ids[spec.key] = user.id;
  }

  return ids;
};

export const PRODUCTION_USER_EMAILS = ["admin@lis.com", ...PRODUCTION_USERS.map((u) => u.email)];
