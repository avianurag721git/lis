import { UserRole } from "../modules/auth/auth.types";
import { normalizeRole } from "../modules/auth/permissions";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  LAB_MANAGER: "Lab Manager",
  RECEPTIONIST: "Receptionist",
  PHLEBOTOMIST: "Phlebotomist",
  LAB_TECH: "Lab Technician",
  PATHOLOGIST: "Pathologist",
  B2B_FRANCHISEE: "B2B Franchisee",
  PATIENT: "Patient",
  TENANT_ADMIN: "Lab Manager",
  STAFF: "Lab Staff",
  CLERK: "Receptionist",
  MANAGER: "Pathologist"
};

export const formatRoleLabel = (role: UserRole | string | undefined): string => {
  if (!role) return "Staff";
  const normalized = normalizeRole(role);
  return ROLE_LABELS[normalized] ?? ROLE_LABELS[role] ?? role.replace(/_/g, " ");
};
