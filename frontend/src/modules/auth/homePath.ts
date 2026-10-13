import {
  hasAnyPermission,
  hasPermission,
  normalizeRole,
  type LabUserRole,
  type Permission,
  type PermissionSubject
} from "./permissions";

export type HomePath = "/" | "/orders" | "/billing" | "/phlebotomy" | "/lab-receiving" | "/lab-results" | "/pathologist" | "/b2b" | "/inventory-qc" | "/account";

const ROLE_HOME: Record<LabUserRole, HomePath> = {
  SUPER_ADMIN: "/",
  LAB_MANAGER: "/",
  RECEPTIONIST: "/orders",
  PHLEBOTOMIST: "/phlebotomy",
  LAB_TECH: "/lab-receiving",
  PATHOLOGIST: "/pathologist",
  B2B_FRANCHISEE: "/b2b",
  PATIENT: "/account" // patient portal (my reports)
};

const PATH_PERMISSIONS: Array<{ path: HomePath; perms: Permission[] }> = [
  { path: "/", perms: ["ANALYTICS_VIEW"] },
  { path: "/orders", perms: ["ORDER_CREATE", "PATIENT_MANAGE"] },
  { path: "/billing", perms: ["BILLING_CREATE"] },
  { path: "/phlebotomy", perms: ["SAMPLE_COLLECT"] },
  { path: "/lab-receiving", perms: ["SAMPLE_RECEIVE"] },
  { path: "/lab-results", perms: ["RESULT_ENTRY"] },
  { path: "/pathologist", perms: ["PATHOLOGIST_VERIFY"] },
  { path: "/b2b", perms: ["B2B_WALLET_MANAGE"] },
  { path: "/inventory-qc", perms: ["REAGENT_MANAGE", "QC_MANAGE"] },
  { path: "/account", perms: [] }
];

const canOpen = (user: PermissionSubject, path: HomePath): boolean => {
  const rule = PATH_PERMISSIONS.find((r) => r.path === path);
  if (!rule || rule.perms.length === 0) return true;
  if (path === "/") return hasPermission(user, "ANALYTICS_VIEW");
  return hasAnyPermission(user, rule.perms);
};

/** First screen after login — the work queue for this role, not a generic 403. */
export const resolveHomePath = (user: PermissionSubject | null | undefined): HomePath => {
  if (!user) return "/account";
  const preferred = ROLE_HOME[normalizeRole(user.role)];
  if (canOpen(user, preferred)) return preferred;
  const fallback = PATH_PERMISSIONS.find((r) => canOpen(user, r.path));
  return fallback?.path ?? "/account";
};
