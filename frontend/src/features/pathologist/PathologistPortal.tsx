import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { env } from "../../utils/env";
import { useTenant } from "../../modules/tenant/tenant.context";
import { httpClient } from "../../services/http";
import {
  PathologistQueueItem,
  pathologistApi
} from "./pathologist.service";

const formatValue = (e: PathologistQueueItem["entries"][number]): string => {
  if (e.value != null) return String(e.value);
  return e.valueText ?? "—";
};

export const PathologistPortal = (): JSX.Element => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rerunInstructions, setRerunInstructions] = useState("");
  const [msg, setMsg] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileLicense, setProfileLicense] = useState("");
  const [profileSig, setProfileSig] = useState("");

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

  useEffect(() => {
    if (!selectedId && queue[0]) setSelectedId(queue[0].labResultId);
  }, [queue, selectedId]);

  const selected = useMemo(
    () => queue.find((r) => r.labResultId === selectedId) ?? queue[0] ?? null,
    [queue, selectedId]
  );

  useEffect(() => {
    if (!tenantId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    socket.on("lab-result:technician-approved", () => {
      void qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    });
    socket.on("lab-result:pathologist-verified", () => {
      void qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [tenantId, qc]);

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (): void => {
    setSelectedIds(new Set(queue.map((q) => q.labResultId)));
  };

  const saveProfileMutation = useMutation({
    mutationFn: () =>
      pathologistApi.saveProfile({
        fullName: profileName,
        medicalLicenseNumber: profileLicense,
        digitalSignatureUrl: profileSig.trim() || null
      }),
    onSuccess: async () => {
      setMsg("Pathologist profile saved.");
      await qc.invalidateQueries({ queryKey: ["pathologist-profile"] });
    },
    onError: () => setMsg("Failed to save profile")
  });

  const batchVerifyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("Nothing selected");
      return pathologistApi.batchVerify({
        labResultIds: ids,
        digitalSignatureUrl: profileSig.trim() || null,
        medicalLicenseNumber: profileLicense || null,
        pathologistName: profileName || null
      });
    },
    onSuccess: async (data) => {
      setMsg(`Verified ${data.verified.length} result(s). Signed PDF generated.`);
      setSelectedIds(new Set());
      setSelectedId("");
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Batch verify failed")
  });

  const rerunMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No selection");
      return pathologistApi.requestRerun({
        labResultId: selected.labResultId,
        instructions: rerunInstructions
      });
    },
    onSuccess: async () => {
      setMsg("Rerun requested — sample returned to technician.");
      setRerunInstructions("");
      setSelectedId("");
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Rerun request failed")
  });

  const distributeMutation = useMutation({
    mutationFn: async (orderId: string) => pathologistApi.distribute(orderId, ["WHATSAPP", "WEBHOOK"]),
    onSuccess: (data) => {
      setMsg(`Distribution: ${data.distributions.map((d) => `${d.channel}=${d.status}`).join(", ")}`);
    },
    onError: () => setMsg("Distribution failed")
  });

  const downloadReport = async (orderId: string): Promise<void> => {
    try {
      const res = await httpClient.get(pathologistApi.downloadUrl(orderId), { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Report download started.");
    } catch {
      setMsg("Download failed — verify results first.");
    }
  };

  const onSaveProfile = (e: FormEvent): void => {
    e.preventDefault();
    saveProfileMutation.mutate();
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Pathologist approval</h1>
        <p className="page-subtitle">
          Review technician-approved results, compare deltas, batch-verify with e-signature, or request rerun.
        </p>
      </div>

      <form className="card" onSubmit={onSaveProfile}>
        <h2 className="card-title">Doctor e-signature profile</h2>
        <div className="form-grid">
          <label className="form-label">
            Full name
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
          </label>
          <label className="form-label">
            Medical license
            <input value={profileLicense} onChange={(e) => setProfileLicense(e.target.value)} required />
          </label>
          <label className="form-label">
            Digital signature URL
            <input
              value={profileSig}
              onChange={(e) => setProfileSig(e.target.value)}
              placeholder="https://…/signature.png"
            />
          </label>
        </div>
        <button type="submit" disabled={saveProfileMutation.isPending} style={{ marginTop: 8 }}>
          Save profile
        </button>
      </form>

      {msg ? <p className="text-muted">{msg}</p> : null}

      <div className="pathologist-layout">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              Queue ({queue.length})
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={selectAllVisible} disabled={queue.length === 0}>
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  const ids = selectedIds.size > 0 ? [...selectedIds] : selected ? [selected.labResultId] : [];
                  batchVerifyMutation.mutate(ids);
                }}
                disabled={batchVerifyMutation.isPending || (selectedIds.size === 0 && !selected)}
              >
                Batch approve ({selectedIds.size || (selected ? 1 : 0)})
              </button>
            </div>
          </div>
          {isLoading ? <p>Loading…</p> : null}
          {queue.length === 0 && !isLoading ? (
            <p className="text-muted">No TECHNICIAN_APPROVED results waiting.</p>
          ) : (
            <ul className="pathologist-queue-list">
              {queue.map((item) => (
                <li
                  key={item.labResultId}
                  className={item.labResultId === selected?.labResultId ? "pathologist-queue-item is-active" : "pathologist-queue-item"}
                >
                  <label className="pathologist-queue-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.labResultId)}
                      onChange={() => toggleSelect(item.labResultId)}
                    />
                    <button type="button" className="linkish" onClick={() => setSelectedId(item.labResultId)}>
                      <strong>
                        {item.orderNumber} · {item.patientName}
                      </strong>
                      <span className="text-muted">
                        {item.testName} · {item.departmentName}
                      </span>
                    </button>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          {!selected ? (
            <p className="text-muted">Select a result to review.</p>
          ) : (
            <>
              <h2 className="card-title">
                {selected.patientName} ({selected.patientUhid}) · {selected.patientAgeYears ?? "—"}Y /{" "}
                {selected.patientGender ?? "—"}
              </h2>
              <p className="text-muted" style={{ marginTop: 0 }}>
                {selected.orderNumber} · {selected.departmentName} · {selected.testName}
                {selected.referredDoctor ? ` · Ref: ${selected.referredDoctor}` : ""}
              </p>

              <div className="pathologist-split">
                <div>
                  <h3 className="card-title" style={{ fontSize: 15 }}>
                    Observed values
                  </h3>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Value</th>
                          <th>Unit</th>
                          <th>Ref interval</th>
                          <th>Method</th>
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
                              {formatValue(e)}
                              {e.flag ? ` (${e.flag})` : ""}
                            </td>
                            <td>{e.unit ?? "—"}</td>
                            <td>{e.referenceRange}</td>
                            <td>{e.methodology ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="card-title" style={{ fontSize: 15 }}>
                    Delta checks & notes
                  </h3>
                  <ul className="pathologist-delta-list">
                    {selected.entries.filter((e) => e.deltaCheck).length === 0 ? (
                      <li className="text-muted">No high-variance delta flags.</li>
                    ) : (
                      selected.entries
                        .filter((e) => e.deltaCheck)
                        .map((e) => (
                          <li key={e.id}>
                            <strong>{e.parameterName}</strong>: prev {e.deltaCheck!.previousValue} →{" "}
                            {formatValue(e)} ({e.deltaCheck!.changePercentage}%)
                          </li>
                        ))
                    )}
                  </ul>
                  <div className="pathologist-notes">
                    <strong>Technician notes</strong>
                    <p>{selected.technicianNote?.trim() || "—"}</p>
                    {selected.entries.some((e) => e.criticalAckNote) ? (
                      <>
                        <strong>Critical acks</strong>
                        <ul>
                          {selected.entries
                            .filter((e) => e.criticalAckNote)
                            .map((e) => (
                              <li key={e.id}>
                                {e.parameterName}: {e.criticalAckNote}
                              </li>
                            ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => batchVerifyMutation.mutate([selected.labResultId])}
                  disabled={batchVerifyMutation.isPending}
                >
                  Approve &amp; sign
                </button>
                <button type="button" onClick={() => void downloadReport(selected.orderId)}>
                  Download signed PDF
                </button>
                <button
                  type="button"
                  onClick={() => distributeMutation.mutate(selected.orderId)}
                  disabled={distributeMutation.isPending}
                >
                  Send WhatsApp / webhook
                </button>
              </div>

              <div className="pathologist-rerun" style={{ marginTop: 16 }}>
                <h3 className="card-title" style={{ fontSize: 15 }}>
                  Rerun request
                </h3>
                <label className="form-label">
                  Instructions for technician
                  <textarea
                    value={rerunInstructions}
                    onChange={(e) => setRerunInstructions(e.target.value)}
                    rows={3}
                    placeholder="Repeat assay / check hemolysis / recalibrate…"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => rerunMutation.mutate()}
                  disabled={rerunMutation.isPending || rerunInstructions.trim().length < 3}
                  style={{ marginTop: 8 }}
                >
                  Send back to technician
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
