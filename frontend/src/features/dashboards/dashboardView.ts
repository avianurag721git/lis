import { normalizeRole } from "../../modules/auth/permissions";

export type DashView = "executive" | "ops" | "pathologist" | "b2b";

/** Role-appropriate landing tab — Lab Manager opens Executive (charts + bookmarks), not Pathologist. */
export const defaultViewForRole = (role: string | undefined): DashView => {
  const r = normalizeRole(role ?? "PATIENT");
  switch (r) {
    case "SUPER_ADMIN":
    case "LAB_MANAGER":
      return "executive";
    case "PATHOLOGIST":
      return "pathologist";
    case "B2B_FRANCHISEE":
      return "b2b";
    case "LAB_TECH":
    case "PHLEBOTOMIST":
      return "ops";
    default:
      return "executive";
  }
};
