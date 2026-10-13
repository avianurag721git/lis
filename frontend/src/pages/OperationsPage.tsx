import { useState, useEffect } from "react";
import { operationsApi, type OperationsStatus } from "../modules/operations/operations.service";
import { useTenant } from "../modules/tenant/tenant.context";

export const OperationsPage = (): JSX.Element => {
  const { hasFeature, saas } = useTenant();
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<"report" | "payment" | null>(null);
  const [status, setStatus] = useState<OperationsStatus | null>(null);

  useEffect(() => {
    const loadStatus = async (): Promise<void> => {
      try {
        const s = await operationsApi.getStatus();
        setStatus(s);
      } catch {
        // Status loading is optional
      }
    };
    void loadStatus();
  }, []);

  const run = async (kind: "report" | "payment"): Promise<void> => {
    setMsg("");
    setErr("");
    setLoading(kind);
    try {
      const data =
        kind === "report" ? await operationsApi.triggerReportGeneration() : await operationsApi.triggerPaymentProcess();
      const count =
        kind === "report"
          ? ` (${data.reportsGenerated ?? 0} reports)`
          : ` (${data.paymentsProcessed ?? 0} payments)`;
      const mode = data.mode === "mock" ? " [mock]" : "";
      setMsg(`${data.message}${count}${mode}${data.detail ? ` — ${data.detail}` : ""}`);
      const s = await operationsApi.getStatus();
      setStatus(s);
    } catch {
      setErr("Request failed. Check authentication, plan feature flag, and server logs.");
    } finally {
      setLoading(null);
    }
  };

  if (!hasFeature("operations_console")) {
    return (
      <section className="page-shell">
        <div className="page-head">
          <h1 className="page-title">Operations</h1>
          <p className="page-subtitle">Available on Enterprise plans for scheduled background tasks.</p>
        </div>
        <div className="card">
          <p className="text-muted">
            Your current plan (<strong>{saas?.plan ?? "—"}</strong>) does not include the operations console. Contact your
            administrator to upgrade to Enterprise or enable this feature.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Operations</h1>
        <p className="page-subtitle">
          Generate missing NABL PDFs for verified orders and reconcile stale Stripe payments. Actions are audited.
        </p>
      </div>

      {status ? (
        <div className="card mb-4">
          <h2 className="card-title">Job status</h2>
          <div className="ops-status">
            <div>
              <span className="ops-status-label">Last report run:</span>
              <span className="ops-status-value">{status.lastReportRun ?? "Never"}</span>
            </div>
            <div>
              <span className="ops-status-label">Last payment run:</span>
              <span className="ops-status-value">{status.lastPaymentRun ?? "Never"}</span>
            </div>
            <div>
              <span className="ops-status-label">Pending PDF reports:</span>
              <span className="ops-status-value">{status.pendingReports ?? 0}</span>
            </div>
            <div>
              <span className="ops-status-label">Stale Stripe payments:</span>
              <span className="ops-status-value">{status.pendingPayments ?? 0}</span>
            </div>
            <div>
              <span className="ops-status-label">Stripe:</span>
              <span className="ops-status-value">
                {status.stripeConfigured ? "Configured" : "Not configured (payment job will mock-skip)"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2 className="card-title">Actions</h2>
        <div className="ops-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading !== null}
            onClick={() => void run("report")}
          >
            {loading === "report" ? "Running…" : "Generate missing reports"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading !== null}
            onClick={() => void run("payment")}
          >
            {loading === "payment" ? "Running…" : "Reconcile Stripe payments"}
          </button>
        </div>
        {msg ? <p className="text-success" style={{ marginTop: 12 }}>{msg}</p> : null}
        {err ? <p className="text-danger" style={{ marginTop: 12 }}>{err}</p> : null}
      </div>
    </section>
  );
};
