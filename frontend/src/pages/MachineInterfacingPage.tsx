import { FormEvent, useEffect, useState } from "react";
import { AnalyzerIngestResult, Hl7Health, hl7Api } from "../features/instruments/hl7.service";
import { useTenant } from "../modules/tenant/tenant.context";

const SAMPLE_HL7 = `MSH|^~\\&|ANALYZER|LAB|LIS|DEMO|20260101120000||ORU^R01|MSG0001|P|2.3
PID|1||PAT-001||DOE^JOHN||19900101|M
OBR|1||BAR10091|CBC^Complete Blood Count
OBX|1|NM|WBC^White Blood Cells||7.2|10*3/uL|4.0-11.0|N|||F
OBX|2|NM|HGB^Hemoglobin||13.5|g/dL|12.0-16.0|N|||F
`;

export const MachineInterfacingPage = (): JSX.Element => {
  const { tenantId } = useTenant();
  const [health, setHealth] = useState<Hl7Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [raw, setRaw] = useState(SAMPLE_HL7.trim());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzerIngestResult | null>(null);
  const [ingestError, setIngestError] = useState("");

  const refreshHealth = async (): Promise<void> => {
    setHealthError("");
    try {
      const h = await hl7Api.health();
      setHealth(h);
    } catch {
      setHealth(null);
      setHealthError("Could not reach HL7/ASTM health endpoint.");
    }
  };

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(id);
  }, []);

  const onIngest = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setIngestError("");
    setResult(null);
    try {
      const ingest = await hl7Api.ingest(raw, tenantId ?? undefined);
      setResult(ingest);
      await refreshHealth();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Ingest failed. Check barcode mapping and authentication.";
      setIngestError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Machine interfacing</h1>
        <p className="page-subtitle">
          HL7 v2 (MLLP) and ASTM E1394 gateway status. Use HTTP ingest to simulate analyzer messages when instruments are
          offline.
        </p>
      </div>

      <div className="card">
        <div className="page-head" style={{ marginBottom: 12 }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            Gateway health
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refreshHealth()}>
            Refresh
          </button>
        </div>
        {healthError ? <p className="text-danger">{healthError}</p> : null}
        {health ? (
          <dl className="kv-grid">
            <dt>TCP gateway</dt>
            <dd>{health.enabled ? "Enabled" : "Disabled"}</dd>
            <dt>TCP port</dt>
            <dd>
              <code className="mono">{health.tcpPort}</code>
            </dd>
            <dt>Default tenant</dt>
            <dd>
              <code className="mono">{health.defaultTenantId}</code>
            </dd>
            <dt>Protocols</dt>
            <dd>{health.protocols?.join(", ") || "—"}</dd>
            <dt>Your tenant</dt>
            <dd>
              <code className="mono">{tenantId ?? "—"}</code>
            </dd>
          </dl>
        ) : !healthError ? (
          <p className="text-muted">Loading…</p>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">HTTP ingest simulator</h2>
        <p className="text-muted">
          Paste a raw HL7 ORU or ASTM frame. The barcode on OBR/OBX must match a collected sample barcode for results to
          populate.
        </p>
        <form onSubmit={(e) => void onIngest(e)}>
          <label className="form-label">
            Raw message
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              className="mono"
              style={{ width: "100%", fontSize: 12 }}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Ingesting…" : "Ingest message"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setRaw(SAMPLE_HL7.trim())}>
              Reset sample HL7
            </button>
          </div>
        </form>
        {ingestError ? <p className="text-danger">{ingestError}</p> : null}
        {result ? (
          <div style={{ marginTop: 16 }}>
            <h3 className="card-title">Last ingest</h3>
            <dl className="kv-grid">
              <dt>Protocol</dt>
              <dd>{result.protocol}</dd>
              <dt>Barcode</dt>
              <dd>
                <code className="mono">{result.barcode || "—"}</code>
              </dd>
              <dt>Sample</dt>
              <dd>
                <code className="mono">{result.sampleId || "—"}</code>
              </dd>
              <dt>Order</dt>
              <dd>
                <code className="mono">{result.orderId || "—"}</code>
              </dd>
              <dt>Populated</dt>
              <dd>
                {result.populatedCount} param(s) · {result.labResultIds?.length ?? 0} result row(s)
              </dd>
              <dt>Unmatched codes</dt>
              <dd>{result.unmatchedCodes?.length ? result.unmatchedCodes.join(", ") : "None"}</dd>
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
};
