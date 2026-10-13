import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from "@tanstack/react-table";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { env } from "../../utils/env";
import { Modal } from "../../components/Modal";
import { useTenant } from "../../modules/tenant/tenant.context";
import { LabResultEntry, labResultsApi, PendingLabResult } from "./labResults.service";
import { VoiceDraft, VoiceResultDictation } from "./VoiceResultDictation";
import { OrderPipelineTracker } from "../../components/OrderPipelineTracker";

type GridRow = LabResultEntry & { draftValue: string };

const DEPARTMENTS = [
  "",
  "Hematology",
  "Biochemistry",
  "Liver Function Test (LFT)",
  "Kidney Function Test (KFT)",
  "Lipid Profile",
  "Thyroid Profile",
  "Electrolytes"
];

export const ResultEntryGrid = (): JSX.Element => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [department, setDepartment] = useState("");
  const [orderId, setOrderId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [acks, setAcks] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [criticalModal, setCriticalModal] = useState<LabResultEntry | null>(null);
  const [pathQueue, setPathQueue] = useState<PendingLabResult[]>([]);
  const [voiceDrafts, setVoiceDrafts] = useState<Record<string, VoiceDraft>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["lab-results-pending", department, orderId],
    queryFn: () =>
      labResultsApi.pending({
        ...(department ? { department } : {}),
        ...(orderId.trim() ? { orderId: orderId.trim() } : {})
      })
  });

  useEffect(() => {
    if (!selectedId && pending[0]) setSelectedId(pending[0].labResultId);
  }, [pending, selectedId]);

  const selected = useMemo(
    () => pending.find((p) => p.labResultId === selectedId) ?? pending[0] ?? null,
    [pending, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    const nextAcks: Record<string, string> = {};
    for (const e of selected.entries) {
      next[e.parameterId] = e.value == null ? "" : String(e.value);
      if (e.criticalAckNote) nextAcks[e.parameterId] = e.criticalAckNote;
    }
    setDrafts(next);
    setAcks(nextAcks);
    setVoiceDrafts({});
    setNote(selected.technicianNote ?? "");
  }, [selected?.labResultId]);

  useEffect(() => {
    if (!tenantId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    socket.on("lab-result:technician-approved", (payload: { data?: { result?: PendingLabResult } }) => {
      const result = payload?.data?.result;
      if (!result) return;
      setPathQueue((prev) => {
        const without = prev.filter((r) => r.labResultId !== result.labResultId);
        return [result, ...without].slice(0, 30);
      });
      void qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
    });
    socket.on("lab-result:queue-update", () => {
      setMsg("New sample received — result entry queue updated");
      void qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
    });
    socket.on(
      "analyzer:data-received",
      (payload: {
        data?: {
          barcode?: string;
          labResultIds?: string[];
          populatedCount?: number;
          orderId?: string;
        };
      }) => {
        const ids = payload?.data?.labResultIds ?? [];
        setMsg(
          `Analyzer feed: barcode ${payload?.data?.barcode ?? "—"} · ${payload?.data?.populatedCount ?? 0} values`
        );
        void qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
        if (ids[0]) {
          setSelectedId((prev) => prev || ids[0]!);
        }
        if (payload?.data?.orderId) setOrderId(payload.data.orderId);
      }
    );
    return () => {
      socket.disconnect();
    };
  }, [tenantId, qc]);

  useEffect(() => {
    void labResultsApi.pathologistQueue().then(setPathQueue).catch(() => setPathQueue([]));
  }, []);

  const rows: GridRow[] = useMemo(() => {
    if (!selected) return [];
    return selected.entries.map((e) => ({
      ...e,
      draftValue: drafts[e.parameterId] ?? ""
    }));
  }, [selected, drafts]);

  const confirmVoiceDraft = (parameterId: string): void => {
    const vd = voiceDrafts[parameterId];
    if (!vd || vd.blocked) return;
    setDrafts((prev) => ({ ...prev, [parameterId]: vd.value }));
    setVoiceDrafts((prev) => {
      const next = { ...prev };
      delete next[parameterId];
      return next;
    });
    inputRefs.current[parameterId]?.focus();
  };

  const onGridKeyDown = (ev: KeyboardEvent<HTMLInputElement>, rowIndex: number, parameterId: string): void => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (voiceDrafts[parameterId] && !voiceDrafts[parameterId]?.blocked) {
        confirmVoiceDraft(parameterId);
        return;
      }
      const next = rows[rowIndex + 1];
      if (next && !next.isCalculated) {
        inputRefs.current[next.parameterId]?.focus();
      }
    }
  };

  const columns = useMemo<ColumnDef<GridRow>[]>(
    () => [
      {
        header: "Parameter",
        accessorKey: "parameterName",
        cell: ({ row }) => (
          <div>
            <strong>{row.original.parameterName}</strong>
            {row.original.formula ? (
              <div className="text-muted" style={{ fontSize: 11 }}>
                calc: {row.original.formula}
              </div>
            ) : null}
          </div>
        )
      },
      {
        header: "Unit",
        accessorKey: "unit",
        cell: ({ row }) => row.original.unit ?? "—"
      },
      {
        header: "Reference",
        accessorKey: "referenceRange"
      },
      {
        header: "Value",
        id: "value",
        cell: ({ row }) => {
          const e = row.original;
          const voiceDraft = voiceDrafts[e.parameterId];
          const displayValue = voiceDraft && !voiceDraft.blocked ? voiceDraft.value : e.draftValue;
          return (
            <input
              ref={(el) => {
                inputRefs.current[e.parameterId] = el;
              }}
              className={
                voiceDraft?.blocked
                  ? "result-input result-input--critical"
                  : voiceDraft
                    ? "result-input bg-amber-200/80 dark:bg-amber-500/20"
                    : e.isCritical
                      ? "result-input result-input--critical"
                      : e.isAbnormal
                        ? "result-input result-input--abnormal"
                        : "result-input"
              }
              value={displayValue}
              disabled={e.isCalculated}
              onChange={(ev) => {
                setDrafts((prev) => ({ ...prev, [e.parameterId]: ev.target.value }));
                setVoiceDrafts((prev) => {
                  const next = { ...prev };
                  delete next[e.parameterId];
                  return next;
                });
              }}
              onKeyDown={(ev) => onGridKeyDown(ev, row.index, e.parameterId)}
              inputMode="decimal"
            />
          );
        }
      },
      {
        header: "Flags",
        id: "flags",
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {e.flag === "H" || e.flag === "L" ? (
                <span className="badge-abnormal font-semibold" title="Abnormal value">
                  ({e.flag})
                </span>
              ) : null}
              {e.isCritical ? (
                <button type="button" className="badge-critical" onClick={() => setCriticalModal(e)}>
                  CRITICAL
                </button>
              ) : null}
              {e.deltaCheck ? (
                <span
                  className="badge-delta badge-delta--alert"
                  title={`Previous: ${e.deltaCheck.previousValue} · Change: ${e.deltaCheck.changePercentage > 0 ? "+" : ""}${e.deltaCheck.changePercentage}%`}
                >
                  ⚠️ Delta {e.deltaCheck.changePercentage > 0 ? "+" : ""}
                  {e.deltaCheck.changePercentage}%
                </span>
              ) : null}
            </div>
          );
        }
      }
    ],
    [rows]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const buildPayload = () => {
    if (!selected) throw new Error("No selection");
    return {
      labResultId: selected.labResultId,
      technicianNote: note || null,
      entries: selected.entries.map((e) => {
        const raw = drafts[e.parameterId];
        const num = raw == null || raw.trim() === "" ? null : Number(raw);
        const entry: {
          parameterId: string;
          value: number | null;
          criticalAckNote?: string | null;
        } = {
          parameterId: e.parameterId,
          value: num != null && Number.isFinite(num) ? num : null
        };
        const ack = acks[e.parameterId];
        if (ack) entry.criticalAckNote = ack;
        return entry;
      })
    };
  };

  const saveMutation = useMutation({
    mutationFn: async () => labResultsApi.saveDraft(buildPayload()),
    onSuccess: async (result) => {
      setMsg("Draft saved (formulas / delta / critical evaluated).");
      if (result.entries.some((e) => e.isCritical && !acks[e.parameterId])) {
        const first = result.entries.find((e) => e.isCritical);
        if (first) setCriticalModal(first);
      }
      await qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
    },
    onError: () => setMsg("Save draft failed")
  });

  const approveMutation = useMutation({
    mutationFn: async () => labResultsApi.technicianApprove(buildPayload()),
    onSuccess: async (result) => {
      setMsg(`Approved · sent to pathologist queue (${result.testName})`);
      setPathQueue((prev) => [result, ...prev.filter((r) => r.labResultId !== result.labResultId)].slice(0, 30));
      await qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
      setSelectedId("");
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Approve failed")
  });

  const ackCritical = (e: FormEvent): void => {
    e.preventDefault();
    if (!criticalModal) return;
    const noteText = acks[criticalModal.parameterId]?.trim();
    if (!noteText) return;
    setCriticalModal(null);
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Lab result entry</h1>
        <p className="page-subtitle">
          Technician grid with formula calc, delta checks, critical panic flags. Enter moves to next row.
        </p>
      </div>

      {selected?.orderId ? <OrderPipelineTracker orderId={selected.orderId} className="mb-4" /> : null}

      <div className="card">
        <div className="form-grid">
          <label className="form-label">
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All</option>
              {DEPARTMENTS.filter(Boolean).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Order ID (optional)
            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order ID" />
          </label>
          <label className="form-label">
            Pending result
            <select value={selected?.labResultId ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
              {pending.map((p) => (
                <option key={p.labResultId} value={p.labResultId}>
                  {p.orderNumber} · {p.patientName} · {p.testName} ({p.status})
                </option>
              ))}
            </select>
          </label>
        </div>
        {isLoading ? <p>Loading…</p> : null}
        {msg ? <p className="text-muted">{msg}</p> : null}
      </div>

      {selected ? (
        <div className="card">
          <h2 className="card-title">
            {selected.patientName} ({selected.patientUhid}) · {selected.patientAgeYears ?? "—"}Y / {selected.patientGender ?? "—"}
          </h2>
          <p className="text-muted" style={{ marginTop: 0 }}>
            {selected.departmentName} · {selected.testName} · {selected.orderNumber}
          </p>

          <VoiceResultDictation
            entries={selected.entries}
            voiceDrafts={voiceDrafts}
            onVoiceDrafts={setVoiceDrafts}
            onConfirm={confirmVoiceDraft}
          />

          <div className="table-scroll result-grid">
            <table className="data-table">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={row.original.isCritical ? "row-critical" : row.original.isAbnormal ? "row-abnormal" : undefined}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="form-label" style={{ marginTop: 12 }}>
            Technician note
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save draft
            </button>
            <button type="button" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              Technician approve
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="text-muted">No pending results. Collect/receive samples for an order first.</p>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Pathologist review queue</h2>
        {pathQueue.length === 0 ? (
          <p className="text-muted">No technician-approved results yet.</p>
        ) : (
          <ul>
            {pathQueue.map((r) => (
              <li key={r.labResultId}>
                {r.orderNumber} · {r.patientName} · {r.testName} · {r.departmentName}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(criticalModal)}
        onClose={() => setCriticalModal(null)}
        title="Critical / panic value"
        size="sm"
        role="alertdialog"
        panelClassName="critical-modal"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCriticalModal(null)}>
              Close
            </button>
            <button type="submit" form="critical-ack-form" className="btn btn-primary">
              Acknowledge
            </button>
          </>
        }
      >
        {criticalModal ? (
          <form id="critical-ack-form" onSubmit={ackCritical}>
            <p style={{ marginTop: 0 }}>
              <strong>{criticalModal.parameterName}</strong> requires acknowledgment before approval.
            </p>
            <label className="form-label">
              Acknowledgment note
              <input
                autoFocus
                value={acks[criticalModal.parameterId] ?? ""}
                onChange={(e) => setAcks((prev) => ({ ...prev, [criticalModal.parameterId]: e.target.value }))}
                required
                placeholder="Notified clinician / repeated / verified…"
              />
            </label>
          </form>
        ) : null}
      </Modal>
    </section>
  );
};
