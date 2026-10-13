import { FormEvent, useEffect, useState } from "react";
import { getAuditLogs } from "../modules/audit/audit.service";
import { AuditAction, AuditLog } from "../modules/audit/audit.types";

const ACTIONS: AuditAction[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "REPORT_GENERATED",
  "PAYMENT_ACTION",
  "PAYMENT_ADDED",
  "PAYMENT_FAILED",
  "INVOICE_CLOSED",
  "REFUND_ISSUED"
];

export const AuditLogsPage = (): JSX.Element => {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [action, setAction] = useState<string>("");
  const [entity, setEntity] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const fetchLogs = async (): Promise<void> => {
    try {
      setBusy(true);
      setError("");
      const response = await getAuditLogs({
        ...(action ? { action: action as AuditAction } : {}),
        ...(entity ? { entity } : {}),
        ...(userId ? { userId } : {}),
        ...(search ? { search } : {}),
        ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
        ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
        page,
        limit: 10
      });
      setItems(response.items ?? []);
      setTotal(response.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
      setError("Could not load audit logs. Check that you are signed in and the API is running.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, [page]);

  const applyFilters = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPage(1);
    void fetchLogs();
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Audit logs</h1>
        <p className="page-subtitle">Search and review activity across your organization.</p>
      </div>

      <div className="card">
        <h2 className="card-title">Filters</h2>
        <form className="filters-grid" onSubmit={applyFilters}>
        <input placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <input placeholder="Entity" value={entity} onChange={(event) => setEntity(event.target.value)} />
        <input placeholder="User" value={userId} onChange={(event) => setUserId(event.target.value)} />
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        <select value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="">All actions</option>
          {ACTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Applying…" : "Apply"}
        </button>
      </form>
      </div>

      <div className="card table-card">
        <h2 className="card-title">Results</h2>
        {error ? <p className="status-error">{error}</p> : null}
        <div className="table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Entity</th>
              <th>User</th>
              <th>Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">
                  No audit log entries yet.
                </td>
              </tr>
            ) : (
              items.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.action}</td>
                  <td>{log.entity}</td>
                  <td>{log.userId ?? "SYSTEM"}</td>
                  <td>{log.entityId ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      <div className="pagination">
        <button type="button" className="btn btn-secondary" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1}>
          Prev
        </button>
        <span>
          Page {page} / {Math.max(1, Math.ceil(total / 10))}
        </span>
        <button type="button" className="btn btn-secondary" onClick={() => setPage((prev) => prev + 1)} disabled={page >= Math.ceil(total / 10)}>
          Next
        </button>
      </div>
    </section>
  );
};
