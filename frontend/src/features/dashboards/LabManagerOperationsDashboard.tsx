import { AlertTriangle, FlaskConical, Truck, UserRound } from "lucide-react";
import { useDashboardRealtime, useLisQueries } from "./useDashboardRealtime";

const STAGE_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  SAMPLE_COLLECTED: "Collected",
  IN_TRANSIT: "In transit",
  RECEIVED_IN_LAB: "In lab",
  PROCESSING: "Processing",
  TECHNICIAN_APPROVED: "Tech approved",
  PATHOLOGIST_VERIFIED: "Verified",
  REPORT_SENT: "Report sent"
};

export const LabManagerOperationsDashboard = (): JSX.Element => {
  const { pipeline } = useLisQueries();
  useDashboardRealtime(["dash-pipeline"]);

  const data = pipeline.data;
  const stages = data?.stages ?? [];
  const alerts = data?.criticalAlerts ?? [];
  const phleb = data?.phlebotomists ?? [];

  return (
    <section className="page-shell dash-shell">
      <div className="page-head">
        <h1 className="page-title">Lab operations</h1>
        <p className="page-subtitle">Live sample pipeline, critical panic alerts, and phlebotomist activity.</p>
      </div>

      <div className="pipeline-grid">
        {stages.map((s) => (
          <article key={s.stage} className="pipeline-card">
            <div className="pipeline-stage">{STAGE_LABELS[s.stage] ?? s.stage}</div>
            <div className="pipeline-count">{s.count}</div>
          </article>
        ))}
      </div>

      <div className={`card critical-widget ${alerts.length ? "critical-widget--active" : ""}`}>
        <div className="critical-widget-head">
          <AlertTriangle size={22} />
          <h2 className="card-title" style={{ margin: 0 }}>
            Critical / panic alerts
          </h2>
        </div>
        {alerts.length === 0 ? (
          <p className="text-muted">No open critical values in draft/processing/tech-approved queues.</p>
        ) : (
          <ul className="critical-list">
            {alerts.map((a) => (
              <li key={`${a.labResultId}-${a.parameterName}`}>
                <strong>
                  {a.patientName} · {a.orderNumber}
                </strong>
                <span>
                  {a.parameterName} = {a.value ?? "—"} · notify clinician
                </span>
                <span className="text-muted">{new Date(a.flaggedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dash-charts">
        <div className="card table-scroll">
          <h2 className="card-title">
            <Truck size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Phlebotomist live tracking (24h)
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Collector</th>
                <th>Collections</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {phleb.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted">
                    No collections logged today.
                  </td>
                </tr>
              ) : (
                phleb.map((p) => (
                  <tr key={p.userId}>
                    <td>
                      <UserRound size={14} style={{ marginRight: 4 }} />
                      {p.userId.slice(0, 8)}…
                    </td>
                    <td>{p.activeCollections}</td>
                    <td>{p.lastCollectedAt ? new Date(p.lastCollectedAt).toLocaleString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="card-title">
            <FlaskConical size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Ops tips
          </h2>
          <ul className="text-muted">
            <li>Pipeline counters update automatically when sample or result status changes.</li>
            <li>Critical rows flash until acknowledged on Result entry.</li>
            <li>Turnaround time is measured from sample collection to pathologist sign-off.</li>
          </ul>
        </div>
      </div>
    </section>
  );
};
