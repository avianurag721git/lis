import { useMemo, useState } from "react";
import { useAuth } from "../../modules/auth/auth.context";
import { UserRole } from "../../modules/auth/auth.types";
import { formatRoleLabel } from "../../utils/roleLabels";
import { ExecutiveDashboard } from "./ExecutiveDashboard";
import { LabManagerOperationsDashboard } from "./LabManagerOperationsDashboard";
import { PathologistReviewDashboard } from "./PathologistReviewDashboard";
import { B2BFranchiseeDashboard } from "./B2BFranchiseeDashboard";

type DashView = "executive" | "ops" | "pathologist" | "b2b";

const defaultViewForRole = (role: UserRole | undefined): DashView => {
  if (role === "SUPER_ADMIN" || role === "TENANT_ADMIN") return "executive";
  if (role === "MANAGER") return "ops";
  if (role === "CLERK") return "b2b";
  return "pathologist";
};

export const RoleBasedDashboard = (): JSX.Element => {
  const { user } = useAuth();
  const initial = useMemo(() => defaultViewForRole(user?.role), [user?.role]);
  const [view, setView] = useState<DashView>(initial);

  return (
    <div>
      <div className="page-shell-align">
        <div className="dash-role-bar card">
          <span className="text-muted">
          Dashboard view for <strong>{formatRoleLabel(user?.role)}</strong>
        </span>
        <div className="dash-tabs">
          {(
            [
              ["executive", "Executive"],
              ["ops", "Lab ops"],
              ["pathologist", "Pathologist"],
              ["b2b", "B2B"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={view === id ? "dash-tab is-active" : "dash-tab"}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      </div>
      {view === "executive" ? <ExecutiveDashboard /> : null}
      {view === "ops" ? <LabManagerOperationsDashboard /> : null}
      {view === "pathologist" ? <PathologistReviewDashboard /> : null}
      {view === "b2b" ? <B2BFranchiseeDashboard /> : null}
    </div>
  );
};
