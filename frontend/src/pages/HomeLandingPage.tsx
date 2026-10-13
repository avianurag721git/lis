import { Navigate } from "react-router-dom";
import { useAuth } from "../modules/auth/auth.context";
import { resolveHomePath } from "../modules/auth/homePath";
import { DashboardPage } from "./DashboardPage";

/** `/` is the executive dashboard only when the role can see it; otherwise send them to their work queue. */
export const HomeLandingPage = (): JSX.Element | null => {
  const { user, isAuthenticated } = useAuth();

  if (isAuthenticated && !user) {
    return null;
  }

  const home = resolveHomePath(user);

  if (home === "/") {
    return <DashboardPage />;
  }

  return <Navigate to={home} replace />;
};
