import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { labAudio } from "../../lib/audio";
import { samplesApi } from "./samples.service";
import type { SampleDto } from "../orders/orders.service";
import { env } from "../../utils/env";
import { useTenant } from "../../modules/tenant/tenant.context";
import { OrderPipelineTracker } from "../../components/OrderPipelineTracker";

const actionLabel = (action: string): string => {
  switch (action) {
    case "COLLECTED":
      return "Collected";
    case "RECEIVED_AND_PROCESSING":
      return "Received in lab · Processing started";
    case "ALREADY_IN_LAB":
      return "Already in lab";
    default:
      return action;
  }
};

export const LabReceivingDesk = (): JSX.Element => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeOrderId, setActiveOrderId] = useState("");

  const { data: samples = [] } = useQuery({
    queryKey: ["samples-desk"],
    queryFn: () => samplesApi.list(),
    refetchInterval: 20000
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    socket.on("sample:updated", (payload: { data?: { sample?: SampleDto } }) => {
      const sample = payload?.data?.sample;
      if (!sample) return;
      qc.setQueryData<SampleDto[]>(["samples-desk"], (prev = []) => {
        const idx = prev.findIndex((s) => s.id === sample.id);
        if (idx === -1) return [sample, ...prev];
        const next = [...prev];
        next[idx] = sample;
        return next;
      });
    });
    socket.on("lab-result:queue-update", () => {
      void qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [tenantId, qc]);

  const scanMutation = useMutation({
    mutationFn: async (input: { barcode: string; accept: boolean; rejectionReason?: string }) => {
      if (input.accept) {
        return samplesApi.rapidScan({ barcode: input.barcode });
      }
      const sample = await samplesApi.receive({
        barcode: input.barcode,
        accept: false,
        rejectionReason: input.rejectionReason ?? null
      });
      return { sample, action: "REJECTED" as const, pipeline: null, labResultsActivated: 0 };
    },
    onSuccess: async (result) => {
      const sample = result.sample;
      const ok = sample.status !== "REJECTED";
      if (ok) labAudio.success();
      else labAudio.error();
      setFlash({
        ok,
        text:
          result.action === "REJECTED"
            ? `${sample.barcode} → REJECTED`
            : `${sample.barcode} → ${actionLabel(result.action)}${result.labResultsActivated ? ` · ${result.labResultsActivated} test(s) queued` : ""}`
      });
      setActiveOrderId(sample.orderId);
      setBarcode("");
      setRejectionReason("");
      setRejectMode(false);
      await qc.invalidateQueries({ queryKey: ["samples-desk"] });
      await qc.invalidateQueries({ queryKey: ["lab-results-pending"] });
      if (sample.orderId) {
        await qc.invalidateQueries({ queryKey: ["order-pipeline", sample.orderId] });
      }
      inputRef.current?.focus();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      labAudio.error();
      const msg = err?.response?.data?.message ?? "Scan failed";
      setFlash({ ok: false, text: String(msg) });
      setBarcode("");
      inputRef.current?.focus();
    }
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!barcode.trim()) return;
    scanMutation.mutate({
      barcode: barcode.trim(),
      accept: !rejectMode,
      ...(rejectMode ? { rejectionReason } : {})
    });
  };

  const recent = samples.slice(0, 40);

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Lab receiving desk</h1>
        <p className="page-subtitle">
          Rapid scan: pending tubes are collected on first scan, received and queued for result entry on second scan.
        </p>
      </div>

      {activeOrderId ? <OrderPipelineTracker orderId={activeOrderId} className="mb-4" /> : null}

      <div className="card">
        <form onSubmit={onSubmit}>
          <label className="form-label">
            Barcode scanner
            <input
              ref={inputRef}
              value={barcode}
              onChange={(e) => {
                if (e.target.value.length > barcode.length) labAudio.blip();
                setBarcode(e.target.value);
              }}
              placeholder="Scan BAR10091… then Enter"
              autoFocus
              style={{ fontSize: 20, letterSpacing: 1 }}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input type="checkbox" checked={rejectMode} onChange={(e) => setRejectMode(e.target.checked)} />
            Reject mode
          </label>
          {rejectMode ? (
            <input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Rejection reason"
              required
              style={{ width: "100%", marginTop: 8 }}
            />
          ) : null}
          <button type="submit" style={{ marginTop: 12 }} disabled={scanMutation.isPending}>
            {rejectMode ? "Reject sample" : "Rapid scan"}
          </button>
        </form>
        {flash ? <p className={flash.ok ? "status-ok" : "status-error"}>{flash.text}</p> : null}
      </div>

      <div className="card">
        <h2 className="card-title">Live sample grid</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Tube</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td>
                    <code>{s.barcode}</code>
                  </td>
                  <td>
                    {s.tubeColor} / {s.sampleType}
                  </td>
                  <td>{s.status}</td>
                  <td>{new Date(s.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
