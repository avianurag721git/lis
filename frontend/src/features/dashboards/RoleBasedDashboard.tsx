import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../modules/auth/auth.context";
import { normalizeRole } from "../../modules/auth/permissions";
import { formatRoleLabel } from "../../utils/roleLabels";
import { ExecutiveDashboard } from "./ExecutiveDashboard";
import { LabManagerOperationsDashboard } from "./LabManagerOperationsDashboard";
import { PathologistReviewDashboard } from "./PathologistReviewDashboard";
import { B2BFranchiseeDashboard } from "./B2BFranchiseeDashboard";
import { defaultViewForRole, type DashView } from "./dashboardView";

export { defaultViewForRole } from "./dashboardView";

const VIEW_STORAGE_KEY = "dlms_dash_view";

const readStoredView = (role: string | undefined): DashView | null => {
  try {
    const raw = sessionStorage.getItem(`${VIEW_STORAGE_KEY}_${normalizeRole(role ?? "PATIENT")}`);
    if (raw === "executive" || raw === "ops" || raw === "pathologist" || raw === "b2b") return raw;
  } catch {
    /* ignore */
  }
  return null;
};

const writeStoredView = (role: string | undefined, view: DashView): void => {
  try {
    sessionStorage.setItem(`${VIEW_STORAGE_KEY}_${normalizeRole(role ?? "PATIENT")}`, view);
  } catch {
    /* ignore */
  }
};

export const RoleBasedDashboard = (): JSX.Element => {
  const { user } = useAuth();
  const preferred = useMemo(
    () => readStoredView(user?.role) ?? defaultViewForRole(user?.role),
    [user?.role]
  );
  const [view, setView] = useState<DashView>(preferred);

  useEffect(() => {
    setView(readStoredView(user?.role) ?? defaultViewForRole(user?.role));
  }, [user?.role]);

  const selectView = (next: DashView): void => {
    setView(next);
    writeStoredView(user?.role, next);
  };

  return (
    <div>
      <div className="page-shell-align">
        <div className="dash-role-bar card">
          <span className="text-muted">
            Dashboard view for <strong>{formatRoleLabel(user?.role)}</strong>
          </span>
          <div className="dash-tabs" role="tablist" aria-label="Dashboard views">
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
                role="tab"
                aria-selected={view === id}
                className={view === id ? "dash-tab is-active" : "dash-tab"}
                onClick={() => selectView(id)}
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
