import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { CheckCheck, FileText, Filter, RotateCcw, TriangleAlert } from "lucide-react";
import { env } from "../../utils/env";
import { Modal } from "../../components/Modal";
import { useTenant } from "../../modules/tenant/tenant.context";
import { PathologistQueueItem, pathologistApi } from "./pathologist.service";
import { AiCoPathologistWidget } from "./AiCoPathologistWidget";

const formatValue = (e: PathologistQueueItem["entries"][number]): string => {
  if (e.value != null) return String(e.value);
  return e.valueText ?? "—";
};

export const PathologistReviewQueue = (): JSX.Element => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [deltaOnly, setDeltaOnly] = useState(false);
  const [rerunNote, setRerunNote] = useState("");
  const [msg, setMsg] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileLicense, setProfileLicense] = useState("");
  const [profileSig, setProfileSig] = useState("");
  const [clinicalImpression, setClinicalImpression] = useState("");
  const [distributeMsg, setDistributeMsg] = useState("");

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["pathologist-queue"],
    queryFn: () => pathologistApi.queue()
  });

  const { data: profile } = useQuery({
    queryKey: ["pathologist-profile"],
    queryFn: () => pathologistApi.getProfile()
  });

  useEffect(() => {
    if (!profile) return;
    setProfileName(profile.fullName);
    setProfileLicense(profile.medicalLicenseNumber);
    setProfileSig(profile.digitalSignatureUrl ?? "");
  }, [profile]);

  const departments = useMemo(
    () => [...new Set(queue.map((q) => q.departmentName))].sort(),
    [queue]
  );

  const filtered = useMemo(() => {
    return queue.filter((item) => {
      if (deptFilter && item.departmentName !== deptFilter) return false;
      if (criticalOnly && !item.entries.some((e) => e.isCritical)) return false;
      if (deltaOnly && !item.entries.some((e) => e.deltaCheck)) return false;
      return true;
    });
  }, [queue, deptFilter, criticalOnly, deltaOnly]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].labResultId);
    if (selectedId && !filtered.some((f) => f.labResultId === selectedId)) {
      setSelectedId(filtered[0]?.labResultId ?? "");
    }
  }, [filtered, selectedId]);

  const selected = useMemo(
    () => filtered.find((r) => r.labResultId === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    if (!tenantId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    const refresh = () => void qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    socket.on("lab-result:technician-approved", refresh);
    socket.on("lab-result:pathologist-verified", refresh);
    return () => {
      socket.disconnect();
    };
  }, [tenantId, qc]);

  const saveProfileMutation = useMutation({
    mutationFn: () =>
      pathologistApi.saveProfile({
        fullName: profileName,
        medicalLicenseNumber: profileLicense,
        digitalSignatureUrl: profileSig.trim() || null
      }),
    onSuccess: async () => {
      setMsg("E-signature profile saved.");
      await qc.invalidateQueries({ queryKey: ["pathologist-profile"] });
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async (labResultId: string) =>
      pathologistApi.verifySingle({
        labResultId,
        digitalSignatureUrl: profileSig.trim() || null,
        medicalLicenseNumber: profileLicense || null,
        pathologistName: profileName || null,
        clinicalImpression: clinicalImpression.trim() || null
      }),
    onSuccess: async (data) => {
      setMsg(`Verified ${data.verified.testName}. Report generated & patient notified.`);
      setSelectedId("");
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Verify failed")
  });

  const batchMutation = useMutation({
    mutationFn: async () =>
      pathologistApi.batchVerify({
        labResultIds: filtered.map((f) => f.labResultId),
        digitalSignatureUrl: profileSig.trim() || null,
        medicalLicenseNumber: profileLicense || null,
        pathologistName: profileName || null
      }),
    onSuccess: async (data) => {
      setMsg(`Batch verified ${data.verified.length} result(s).`);
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Batch failed")
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No selection");
      return pathologistApi.rejectRerun({ labResultId: selected.labResultId, note: rerunNote });
    },
    onSuccess: async () => {
      setMsg("Rejected for rerun — sent back to PROCESSING.");
      setRerunNote("");
      setSelectedId("");
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Reject failed")
  });

  const distributeMutation = useMutation({
    mutationFn: async (orderId: string) => pathologistApi.distribute(orderId, ["WHATSAPP", "WEBHOOK", "SMS"]),
    onSuccess: (data) => {
      const summary = data.distributions
        .map((d) => {
          const extra = [
            d.status,
            (d as { mock?: boolean }).mock ? "mock" : null,
            (d as { reason?: string }).reason
          ]
            .filter(Boolean)
            .join(" · ");
          return `${d.channel}: ${extra}`;
        })
        .join("; ");
      setDistributeMsg(summary || "Distribution recorded");
      setMsg(`Report distribution: ${summary}`);
    },
    onError: (err: any) => {
      setDistributeMsg("");
      setMsg(err?.response?.data?.message ?? "Distribute failed — generate/verify PDF first");
    }
  });

  const openPdfPreview = async (): Promise<void> => {
    if (!selected) return;
    try {
      // Ensure report exists by verifying first is ideal; for preview after verify use download
      const blob = await pathologistApi.downloadPdfBlob(selected.orderId);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
    } catch {
      setMsg("PDF not ready — approve and e-sign first to generate the report.");
    }
  };

  const closePdfPreview = (): void => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
  };

  const onSaveProfile = (e: FormEvent): void => {
    e.preventDefault();
    saveProfileMutation.mutate();
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Pathologist verification</h1>
        <p className="page-subtitle">
          Review critical and delta-flagged results — approve and e-sign, preview PDF, or reject for rerun.
        </p>
      </div>

      <form className="card" onSubmit={onSaveProfile}>
        <h2 className="card-title">Digital signature profile</h2>
        <div className="form-grid">
          <label className="form-label">
            Full name
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
          </label>
          <label className="form-label">
            Medical license (MCI / DMC)
            <input value={profileLicense} onChange={(e) => setProfileLicense(e.target.value)} required />
          </label>
          <label className="form-label">
            Signature image URL
            <input value={profileSig} onChange={(e) => setProfileSig(e.target.value)} placeholder="https://…" />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 8 }} disabled={saveProfileMutation.isPending}>
          {saveProfileMutation.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>

      {msg ? <p className="text-muted">{msg}</p> : null}

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <label className="form-label">
          <Filter size={14} /> Department
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
          Critical panic only
        </label>
        <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={deltaOnly} onChange={(e) => setDeltaOnly(e.target.checked)} />
          Delta &gt;20% only
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={batchMutation.isPending || filtered.length === 0}
          onClick={() => batchMutation.mutate()}
        >
          <CheckCheck size={14} style={{ marginRight: 4 }} />
          Batch approve all filtered ({filtered.length})
        </button>
      </div>

      <div className="pathologist-layout">
        <div className="card">
          <h2 className="card-title">Queue ({filtered.length})</h2>
          {isLoading ? <p>Loading…</p> : null}
          <ul className="pathologist-queue-list">
            {filtered.map((item) => {
              const hasCrit = item.entries.some((e) => e.isCritical);
              const hasDelta = item.entries.some((e) => e.deltaCheck);
              return (
                <li
                  key={item.labResultId}
                  className={
                    item.labResultId === selected?.labResultId
                      ? "pathologist-queue-item is-active"
                      : "pathologist-queue-item"
                  }
                >
                  <button type="button" className="linkish" onClick={() => setSelectedId(item.labResultId)}>
                    <strong>
                      {item.orderNumber} · {item.patientName}
                    </strong>
                    <span className="text-muted">
                      {item.testName} · {item.departmentName}
                    </span>
                    <span style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      {hasCrit ? <span className="badge-critical">CRITICAL</span> : null}
                      {hasDelta ? (
                        <span className="badge-delta">
                          <TriangleAlert size={10} /> Δ
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && !isLoading ? (
            <p className="text-muted">No TECHNICIAN_APPROVED results match filters.</p>
          ) : null}
        </div>

        <div className="card">
          {!selected ? (
            <p className="text-muted">Select a result to review.</p>
          ) : (
            <div className="pathologist-split">
              <div>
                <h2 className="card-title">Patient &amp; history</h2>
                <p style={{ marginTop: 0 }}>
                  <strong>
                    {selected.patientName} ({selected.patientUhid})
                  </strong>
                  <br />
                  {selected.patientAgeYears ?? "—"}Y / {selected.patientGender ?? "—"}
                  <br />
                  <span className="text-muted">
                    {selected.orderNumber} · Ref: {selected.referredDoctor ?? "Self"}
                  </span>
                </p>
                <h3 className="card-title" style={{ fontSize: 14 }}>
                  Delta checks (&gt;20%)
                </h3>
                <ul className="pathologist-delta-list">
                  {selected.entries.filter((e) => e.deltaCheck).length === 0 ? (
                    <li className="text-muted">No high-variance deltas.</li>
                  ) : (
                    selected.entries
                      .filter((e) => e.deltaCheck)
                      .map((e) => (
                        <li key={e.id}>
                          <strong>{e.parameterName}</strong>: prev {e.deltaCheck!.previousValue} → {formatValue(e)} (
                          {e.deltaCheck!.changePercentage}%)
                        </li>
                      ))
                  )}
                </ul>
                <div className="pathologist-notes">
                  <strong>Technician notes</strong>
                  <p>{selected.technicianNote?.trim() || "—"}</p>
                </div>
              </div>

              <div>
                <h2 className="card-title">
                  {selected.departmentName} · {selected.testName}
                </h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>Value</th>
                        <th>Unit</th>
                        <th>Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.entries.map((e) => (
                        <tr
                          key={e.id}
                          className={e.isCritical ? "row-critical" : e.isAbnormal ? "row-abnormal" : undefined}
                        >
                          <td>{e.parameterName}</td>
                          <td>
                            <strong>
                              {formatValue(e)}
                              {e.flag ? ` (${e.flag})` : ""}
                              {e.isCritical ? " CRITICAL" : ""}
                            </strong>
                          </td>
                          <td>{e.unit ?? "—"}</td>
                          <td>{e.referenceRange}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <AiCoPathologistWidget
                  item={selected}
                  draftImpression={clinicalImpression}
                  onDraftChange={setClinicalImpression}
                />

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={verifyMutation.isPending}
                    onClick={() => verifyMutation.mutate(selected.labResultId)}
                  >
                    <CheckCheck size={14} style={{ marginRight: 4 }} />
                    {verifyMutation.isPending ? "Approving…" : "Approve & E-Sign"}
                  </button>
                  <button type="button" onClick={() => void openPdfPreview()}>
                    <FileText size={14} style={{ marginRight: 4 }} />
                    Preview PDF
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={distributeMutation.isPending}
                    onClick={() => {
                      setDistributeMsg("");
                      distributeMutation.mutate(selected.orderId);
                    }}
                  >
                    {distributeMutation.isPending ? "Sending…" : "Resend WhatsApp / channels"}
                  </button>
                </div>
                {distributeMsg ? (
                  <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                    {distributeMsg}
                  </p>
                ) : null}

                <div className="pathologist-rerun" style={{ marginTop: 16 }}>
                  <h3 className="card-title" style={{ fontSize: 14 }}>
                    Reject / rerun
                  </h3>
                  <textarea
                    rows={3}
                    value={rerunNote}
                    onChange={(e) => setRerunNote(e.target.value)}
                    placeholder="Pathologist instructions for technician…"
                  />
                  <button
                    type="button"
                    style={{ marginTop: 8 }}
                    disabled={rejectMutation.isPending || rerunNote.trim().length < 3}
                    onClick={() => rejectMutation.mutate()}
                  >
                    <RotateCcw size={14} style={{ marginRight: 4 }} />
                    {rejectMutation.isPending ? "Rejecting…" : "Reject & send to PROCESSING"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(pdfPreviewUrl)}
        onClose={closePdfPreview}
        title="Report preview"
        size="xl"
        panelClassName="modal-panel--pdf"
      >
        {pdfPreviewUrl ? (
          <iframe
            title="PDF preview"
            src={pdfPreviewUrl}
            className="modal-pdf-frame"
          />
        ) : null}
      </Modal>
    </section>
  );
};
