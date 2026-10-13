export const PERMISSIONS = [
  "PATIENT_MANAGE",
  "ORDER_CREATE",
  "SAMPLE_COLLECT",
  "SAMPLE_RECEIVE",
  "RESULT_ENTRY",
  "PATHOLOGIST_VERIFY",
  "BILLING_CREATE",
  "DISCOUNT_APPROVE_HIGH",
  "B2B_WALLET_MANAGE",
  "REAGENT_MANAGE",
  "QC_MANAGE",
  "ANALYTICS_VIEW",
  "SETTINGS_MANAGE"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const LAB_ROLES = [
  "SUPER_ADMIN",
  "LAB_MANAGER",
  "RECEPTIONIST",
  "PHLEBOTOMIST",
  "LAB_TECH",
  "PATHOLOGIST",
  "B2B_FRANCHISEE",
  "PATIENT"
] as const;

export type LabUserRole = (typeof LAB_ROLES)[number];

/** @deprecated Legacy roles — normalized to LabUserRole at runtime */
export const LEGACY_ROLES = ["TENANT_ADMIN", "STAFF", "CLERK", "MANAGER"] as const;
export type LegacyUserRole = (typeof LEGACY_ROLES)[number];

export type UserRole = LabUserRole | LegacyUserRole;

export const REGISTER_ROLES = [
  "LAB_MANAGER",
  "RECEPTIONIST",
  "PHLEBOTOMIST",
  "LAB_TECH",
  "PATHOLOGIST",
  "B2B_FRANCHISEE",
  "PATIENT"
] as const satisfies readonly LabUserRole[];

export type RegisterRole = (typeof REGISTER_ROLES)[number];

export const normalizeRole = (role: string): LabUserRole => {
  switch (role) {
    case "SUPER_ADMIN":
      return "SUPER_ADMIN";
    case "LAB_MANAGER":
    case "TENANT_ADMIN":
      return "LAB_MANAGER";
    case "RECEPTIONIST":
    case "CLERK":
      return "RECEPTIONIST";
    case "PHLEBOTOMIST":
      return "PHLEBOTOMIST";
    case "LAB_TECH":
    case "STAFF":
      return "LAB_TECH";
    case "PATHOLOGIST":
    case "MANAGER":
      return "PATHOLOGIST";
    case "B2B_FRANCHISEE":
      return "B2B_FRANCHISEE";
    case "PATIENT":
      return "PATIENT";
    default:
      return "PATIENT";
  }
};

export const ROLE_DEFAULT_PERMISSIONS: Record<LabUserRole, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  LAB_MANAGER: [...PERMISSIONS],
  RECEPTIONIST: ["PATIENT_MANAGE", "ORDER_CREATE", "BILLING_CREATE"],
  PHLEBOTOMIST: ["SAMPLE_COLLECT"],
  LAB_TECH: ["SAMPLE_RECEIVE", "RESULT_ENTRY", "REAGENT_MANAGE", "QC_MANAGE"],
  PATHOLOGIST: ["PATHOLOGIST_VERIFY", "ANALYTICS_VIEW", "RESULT_ENTRY"],
  B2B_FRANCHISEE: ["B2B_WALLET_MANAGE", "ORDER_CREATE"],
  PATIENT: []
};

export type PermissionSubject = {
  role: string;
  customPermissions?: Permission[];
};

export const resolveEffectivePermissions = (user: PermissionSubject): Permission[] => {
  const role = normalizeRole(user.role);
  if (role === "SUPER_ADMIN" || role === "LAB_MANAGER") {
    return [...PERMISSIONS];
  }
  if (user.customPermissions && user.customPermissions.length > 0) {
    return [...user.customPermissions];
  }
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
};

export const hasPermission = (user: PermissionSubject, perm: Permission): boolean => {
  const role = normalizeRole(user.role);
  if (role === "SUPER_ADMIN" || role === "LAB_MANAGER") {
    return true;
  }
  return resolveEffectivePermissions(user).includes(perm);
};

export const hasAnyPermission = (user: PermissionSubject, perms: Permission[]): boolean =>
  perms.some((p) => hasPermission(user, p));

export const maxDiscountPercentForRole = (role: string): number => {
  const labRole = normalizeRole(role);
  if (labRole === "SUPER_ADMIN" || labRole === "LAB_MANAGER") return 100;
  if (labRole === "PATHOLOGIST") return 25;
  if (hasPermission({ role, customPermissions: ROLE_DEFAULT_PERMISSIONS[labRole] }, "DISCOUNT_APPROVE_HIGH")) {
    return 25;
  }
  return 10;
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  PATIENT_MANAGE: "Patient registration & UHID",
  ORDER_CREATE: "Order booking",
  SAMPLE_COLLECT: "Phlebotomy & sample collection",
  SAMPLE_RECEIVE: "Lab receiving & barcodes",
  RESULT_ENTRY: "Result entry grid",
  PATHOLOGIST_VERIFY: "Pathologist verification",
  BILLING_CREATE: "Billing & payments",
  DISCOUNT_APPROVE_HIGH: "High discount approval",
  B2B_WALLET_MANAGE: "B2B franchisee wallet",
  REAGENT_MANAGE: "Reagent inventory",
  QC_MANAGE: "Quality control & instruments",
  ANALYTICS_VIEW: "Analytics & dashboards",
  SETTINGS_MANAGE: "Role & permission settings"
};
