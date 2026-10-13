import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FlaskConical, TriangleAlert } from "lucide-react";
import { pathologistApi, PathologistQueueItem } from "../pathologist/pathologist.service";
import { useDashboardRealtime } from "./useDashboardRealtime";

export const PathologistReviewDashboard = (): JSX.Element => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  useDashboardRealtime(["pathologist-queue", "dash-pipeline"]);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["pathologist-queue"],
    queryFn: () => pathologistApi.queue(),
    refetchInterval: 20_000
  });

  const { data: profile } = useQuery({
    queryKey: ["pathologist-profile"],
    queryFn: () => pathologistApi.getProfile()
  });

  const filtered = useMemo(() => {
    const n = filter.trim().toLowerCase();
    if (!n) return queue;
    return queue.filter(
      (r) =>
        r.patientName.toLowerCase().includes(n) ||
        r.orderNumber.toLowerCase().includes(n) ||
        r.testName.toLowerCase().includes(n) ||
        r.departmentName.toLowerCase().includes(n)
    );
  }, [queue, filter]);

  const deltaCount = (item: PathologistQueueItem): number =>
    item.entries.filter((e) => e.deltaCheck).length;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchMutation = useMutation({
    mutationFn: async () => {
      const ids = selected.size ? [...selected] : filtered.map((f) => f.labResultId);
      return pathologistApi.batchVerify({
        labResultIds: ids,
        digitalSignatureUrl: profile?.digitalSignatureUrl ?? null,
        medicalLicenseNumber: profile?.medicalLicenseNumber ?? null,
        pathologistName: profile?.fullName ?? null
      });
    },
    onSuccess: async (data) => {
      setMsg(`Verified ${data.verified.length} result(s) with digital signature.`);
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Batch verify failed (QC hold?)")
  });

  return (
    <section className="page-shell dash-shell">
      <div className="page-head">
        <h1 className="page-title">Pathologist review</h1>
        <p className="page-subtitle">
          Verification queue with delta alerts. Batch approve attaches your e-signature profile.
        </p>
      </div>

      <div className="card card-toolbar">
        <label className="form-label">
          Filter
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Patient / order / test" />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={batchMutation.isPending || filtered.length === 0}
          onClick={() => batchMutation.mutate()}
        >
          <CheckCheck size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Batch approve ({selected.size || filtered.length})
        </button>
      </div>

      {msg ? <p className="text-muted">{msg}</p> : null}
      {isLoading ? <p>Loading queue…</p> : null}

      <div className="card table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>Order</th>
              <th>Patient</th>
              <th>Test</th>
              <th>Dept</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const deltas = deltaCount(item);
              return (
                <tr key={item.labResultId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(item.labResultId)}
                      onChange={() => toggle(item.labResultId)}
                    />
                  </td>
                  <td>{item.orderNumber}</td>
                  <td>
                    {item.patientName}
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {item.patientAgeYears ?? "—"}Y / {item.patientGender ?? "—"}
                    </div>
                  </td>
                  <td>
                    <FlaskConical size={14} style={{ marginRight: 4 }} />
                    {item.testName}
                  </td>
                  <td>{item.departmentName}</td>
                  <td>
                    {deltas > 0 ? (
                      <span className="badge-delta dash-delta-badge">
                        <TriangleAlert size={12} /> {deltas} Δ&gt;20%
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && !isLoading ? (
          <p className="text-muted">No technician-approved results waiting.</p>
        ) : null}
      </div>
    </section>
  );
};
