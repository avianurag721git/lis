import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { formatLabelKey } from "../../utils/formatLabel";
import { NumberField } from "../../components/NumberField";
import { ControlLevel, inventoryApi } from "./inventory.service";
import { LeveyJenningsChart } from "./LeveyJenningsChart";
import { ReagentInventoryTracker } from "./ReagentInventoryTracker";

export const QcInventoryPortal = (): JSX.Element => {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<"inventory" | "qc">(tabParam === "qc" ? "qc" : "inventory");
  const [parameterName, setParameterName] = useState("Hemoglobin");
  const [controlLevel, setControlLevel] = useState<ControlLevel>("LEVEL_1_NORMAL");
  const [targetMean, setTargetMean] = useState(13.5);
  const [targetSd, setTargetSd] = useState(0.4);
  const [observedValue, setObservedValue] = useState(13.5);
  const [instrumentCode, setInstrumentCode] = useState("SYS-XN-550");
  const [reagentId, setReagentId] = useState("");
  const [msg, setMsg] = useState("");

  const { data: reagents = [] } = useQuery({
    queryKey: ["reagents"],
    queryFn: () => inventoryApi.listReagents()
  });

  const { data: chart, refetch: refetchChart } = useQuery({
    queryKey: ["lj-chart", parameterName, controlLevel],
    queryFn: () => inventoryApi.leveyJennings(parameterName, controlLevel),
    enabled: tab === "qc"
  });

  const { data: holds = [], refetch: refetchHolds } = useQuery({
    queryKey: ["qc-holds"],
    queryFn: () => inventoryApi.listHolds(),
    enabled: tab === "qc"
  });

  const { data: instruments = [], refetch: refetchInstruments } = useQuery({
    queryKey: ["qc-instruments"],
    queryFn: () => inventoryApi.listInstruments(),
    enabled: tab === "qc"
  });

  useEffect(() => {
    if (tabParam === "qc" || tabParam === "inventory") {
      setTab(tabParam);
    }
  }, [tabParam]);

  const selectTab = (next: "inventory" | "qc"): void => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  useEffect(() => {
    if (!reagentId && reagents[0]) setReagentId(reagents[0].id);
  }, [reagents, reagentId]);

  const recordMutation = useMutation({
    mutationFn: () =>
      inventoryApi.recordControl({
        parameterName,
        controlLevel,
        targetMean,
        targetSd,
        observedValue,
        instrumentCode: instrumentCode || null,
        reagentId: reagentId || null,
        testId: reagents.find((r) => r.id === reagentId)?.testId ?? null
      }),
    onSuccess: async (data) => {
      const flags = data.evaluation.flags.join(", ") || "none";
      setMsg(
        data.evaluation.isReject
          ? `REJECT (${data.evaluation.rejectRules.join(", ")}) — ${data.evaluation.correctiveAction} Flags: ${flags}`
          : `Recorded z=${data.evaluation.zScore} (${data.evaluation.status}). Flags: ${flags}`
      );
      await refetchChart();
      await refetchHolds();
      await refetchInstruments();
      await qc.invalidateQueries({ queryKey: ["pathologist-queue"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "QC record failed")
  });

  const resolveMutation = useMutation({
    mutationFn: (holdId: string) => inventoryApi.resolveHold(holdId, true),
    onSuccess: async () => {
      setMsg("Calibration pass logged — hold resolved & instrument restored.");
      await refetchHolds();
      await refetchInstruments();
    }
  });

  const onRecord = (e: FormEvent): void => {
    e.preventDefault();
    recordMutation.mutate();
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Reagents &amp; QC</h1>
        <p className="page-subtitle">
          Track reagent stock and run quality control. Failed QC pauses instruments until they are recalibrated.
        </p>
      </div>

      <div className="dash-tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={tab === "inventory" ? "dash-tab is-active" : "dash-tab"}
          onClick={() => selectTab("inventory")}
        >
          Inventory
        </button>
        <button
          type="button"
          className={tab === "qc" ? "dash-tab is-active" : "dash-tab"}
          onClick={() => selectTab("qc")}
        >
          Quality control
        </button>
      </div>

      {tab === "inventory" ? <ReagentInventoryTracker /> : null}

      {tab === "qc" ? (
        <>
          {msg ? <p className="text-muted">{msg}</p> : null}

          {instruments.some((i) => i.status === "OUT_OF_CALIBRATION") ? (
            <div className="card" style={{ borderColor: "#b91c1c" }}>
              <h2 className="card-title text-danger">Instruments out of calibration</h2>
              <ul>
                {instruments
                  .filter((i) => i.status === "OUT_OF_CALIBRATION")
                  .map((i) => (
                    <li key={i.id}>
                      <strong>{i.code}</strong> — {i.outOfCalibrationReason ?? "QC check failed"}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <form className="card" onSubmit={onRecord}>
            <h2 className="card-title">Record control sample</h2>
            <div className="form-grid">
              <label className="form-label">
                Parameter
                <input value={parameterName} onChange={(e) => setParameterName(e.target.value)} required />
              </label>
              <label className="form-label">
                Level
                <select
                  value={controlLevel}
                  onChange={(e) => setControlLevel(e.target.value as ControlLevel)}
                >
                  <option value="LEVEL_1_NORMAL">{formatLabelKey("LEVEL_1_NORMAL")}</option>
                  <option value="LEVEL_2_HIGH">{formatLabelKey("LEVEL_2_HIGH")}</option>
                  <option value="LEVEL_3_LOW">{formatLabelKey("LEVEL_3_LOW")}</option>
                </select>
              </label>
              <label className="form-label">
                Target mean
                <NumberField step="any" value={targetMean} onValueChange={setTargetMean} />
              </label>
              <label className="form-label">
                Target SD
                <NumberField step="any" min={0.0001} value={targetSd} onValueChange={setTargetSd} />
              </label>
              <label className="form-label">
                Observed
                <NumberField step="any" value={observedValue} onValueChange={setObservedValue} />
              </label>
              <label className="form-label">
                Reagent lot
                <select value={reagentId} onChange={(e) => setReagentId(e.target.value)}>
                  <option value="">—</option>
                  {reagents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.lotNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Instrument
                <input value={instrumentCode} onChange={(e) => setInstrumentCode(e.target.value)} />
              </label>
            </div>
            <button type="submit" style={{ marginTop: 8 }} disabled={recordMutation.isPending}>
              Run QC check
            </button>
          </form>

          <div className="card">
            <h2 className="card-title">
              Levey-Jennings — {parameterName} ({formatLabelKey(controlLevel)})
            </h2>
            <LeveyJenningsChart
              points={chart?.points ?? []}
              bands={chart?.bands ?? null}
              instrumentHint={instrumentCode}
            />
          </div>

          <div className="card">
            <h2 className="card-title">Active QC holds</h2>
            {holds.length === 0 ? (
              <p className="text-muted">No active holds.</p>
            ) : (
              <ul>
                {holds.map((h) => (
                  <li key={h.id} style={{ marginBottom: 8 }}>
                    <strong>{h.westgardRule}</strong> — {h.reason}{" "}
                    <button type="button" onClick={() => resolveMutation.mutate(h.id)}>
                      Resolve + calibration pass
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
};
