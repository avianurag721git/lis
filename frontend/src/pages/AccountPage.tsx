import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getUserProfile, UserProfile } from "../services/user.service";
import { formatRoleLabel } from "../utils/roleLabels";
import { normalizeRole } from "../modules/auth/permissions";
import { useAuth } from "../modules/auth/auth.context";
import { httpClient } from "../services/http";

type MyReport = {
  orderId: string;
  orderNumber: string;
  patientName: string;
  patientCode: string;
  orderedAt: string;
  reportAt: string | null;
  hasPdf: boolean;
  viewUrl: string | null;
  passcode: string | null;
};

export const AccountPage = (): JSX.Element => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string>("");
  const [reports, setReports] = useState<MyReport[]>([]);
  const [reportsError, setReportsError] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);

  const effectiveRole = profile?.role ?? user?.role ?? "PATIENT";
  const isPatient = normalizeRole(effectiveRole) === "PATIENT";
  const canSeePortal =
    isPatient ||
    normalizeRole(effectiveRole) === "LAB_MANAGER" ||
    normalizeRole(effectiveRole) === "SUPER_ADMIN";

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const p = await getUserProfile();
        setProfile(p);
      } catch {
        if (user) {
          setProfile({
            userId: user.userId,
            email: user.email,
            role: user.role,
            ...(user.name ? { name: user.name } : {})
          });
        } else {
          setError("Unable to load profile.");
        }
      }
    };
    void load();
  }, [user]);

  useEffect(() => {
    if (!canSeePortal) return;

    const loadReports = async (): Promise<void> => {
      setReportsLoading(true);
      setReportsError("");
      try {
        const { data } = await httpClient.get<{ success: true; data: { reports: MyReport[] } }>(
          "/api/reports/my"
        );
        setReports(data.data.reports ?? []);
      } catch {
        setReports([]);
        setReportsError(
          isPatient
            ? "No linked reports yet. Ask the lab if your UHID matches your login email local-part, or use a passcode link from WhatsApp/SMS."
            : "Could not load patient-portal report list."
        );
      } finally {
        setReportsLoading(false);
      }
    };
    void loadReports();
  }, [canSeePortal, isPatient]);

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">{isPatient ? "My reports" : "Account"}</h1>
        <p className="page-subtitle">
          {isPatient
            ? "View reports linked to your account, or open a passcode link from the lab."
            : "Your account details and access level."}
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Profile</h2>
        {error ? <p className="text-error">{error}</p> : null}
        {profile || user ? (
          <dl className="kv-grid">
            <dt>User ID</dt>
            <dd>
              <code className="mono">{profile?.userId ?? user?.userId}</code>
            </dd>
            <dt>Email</dt>
            <dd>{profile?.email ?? user?.email}</dd>
            <dt>Role</dt>
            <dd>
              <span className="badge badge-role">{formatRoleLabel(effectiveRole)}</span>
            </dd>
          </dl>
        ) : !error ? (
          <p className="text-muted">Loading…</p>
        ) : null}
      </div>

      {canSeePortal ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="card-title">Reports</h2>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Matched by patient UHID/code = your email (or email local-part), phone, or exact name. Public passcode links
            also work without login via <code>/report-view/:passcode</code>.
          </p>
          {reportsLoading ? <p className="text-muted">Loading reports…</p> : null}
          {reportsError && reports.length === 0 ? <p className="text-muted">{reportsError}</p> : null}
          {reports.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Patient</th>
                    <th>Ordered</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.orderId}>
                      <td>
                        <code className="mono">{r.orderNumber}</code>
                      </td>
                      <td>
                        {r.patientName}{" "}
                        <span className="text-muted">({r.patientCode})</span>
                      </td>
                      <td>{r.orderedAt ? new Date(r.orderedAt).toLocaleString() : "—"}</td>
                      <td>
                        {r.passcode ? (
                          <Link to={`/report-view/${r.passcode}`}>Open report</Link>
                        ) : r.hasPdf ? (
                          "PDF on file"
                        ) : (
                          "Pending"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
