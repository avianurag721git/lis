import type { LabUserRole, Permission } from "./permissions";

export type UserRole = LabUserRole | "TENANT_ADMIN" | "STAFF" | "CLERK" | "MANAGER";

export type AuthUser = {
  userId: string;
  tenantId: string;
  email: string;
  name?: string;
  role: UserRole;
  customPermissions: Permission[];
  effectivePermissions: Permission[];
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  accessExpiresIn?: string;
};

export type LoginResponse = AuthTokens & {
  user: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    role: UserRole;
    customPermissions?: Permission[];
    effectivePermissions?: Permission[];
    createdAt: string;
  };
};
