import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../modules/auth/auth.context";
import type { Permission } from "../modules/auth/permissions";
import { normalizeRole } from "../modules/auth/permissions";
import { AccessDeniedPage } from "../pages/AccessDeniedPage";

export const ProtectedRoute = (): JSX.Element => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

type PermissionRouteProps = {
  requiredPermission?: Permission | Permission[];
};

export const PermissionRoute = ({ requiredPermission }: PermissionRouteProps): JSX.Element => {
  const { hasPermission } = useAuth();

  if (!requiredPermission) {
    return <Outlet />;
  }

  const required = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  if (required.some((perm) => hasPermission(perm))) {
    return <Outlet />;
  }

  return <AccessDeniedPage />;
};

/** SaaS platform console — SUPER_ADMIN only (backend also enforces). */
export const SuperAdminRoute = (): JSX.Element => {
  const { user } = useAuth();
  if (user && normalizeRole(user.role) === "SUPER_ADMIN") {
    return <Outlet />;
  }
  return <AccessDeniedPage />;
};
