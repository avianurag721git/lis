import type { LabUserRole, LegacyUserRole, Permission, RegisterRole } from "./permissions";

export type { Permission, LabUserRole, RegisterRole, LegacyUserRole };
export { PERMISSIONS, normalizeRole, hasPermission, resolveEffectivePermissions, maxDiscountPercentForRole } from "./permissions";

/** All assignable roles including legacy aliases stored in JWT / DB */
export type UserRole = LabUserRole | LegacyUserRole;

export type User = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  customPermissions: Permission[];
  refreshTokenHash: string | null;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  customPermissions: Permission[];
  effectivePermissions: Permission[];
  createdAt: string;
};

export type JwtPayload = {
  sub: string;
  role: UserRole;
  email: string;
  tenantId: string;
  permissions: Permission[];
};
