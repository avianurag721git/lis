import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { env } from "../../utils/env";

type VerifyResult = {
  valid: boolean;
  orderId: string;
  generatedAt: string | null;
  orderNumber?: string;
  patientName?: string;
  verifiedAt?: string | null;
};

export const PublicReportVerifyPage = (): JSX.Element => {
  const { orderId = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") ?? undefined;
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setError("Missing order id");
      return;
    }
    const q = token ? `?t=${encodeURIComponent(token)}` : "";
    void fetch(`${env.apiUrl}/api/reports/verify-public/${orderId}${q}`)
      .then(async (res) => {
        const json = (await res.json()) as { success?: boolean; data?: VerifyResult; message?: string };
        if (!res.ok || !json.data) throw new Error(json.message ?? "Verification failed");
        setResult(json.data);
      })
      .catch((err: Error) => setError(err.message || "Unable to verify"))
      .finally(() => setLoading(false));
  }, [orderId, token]);

  return (
    <main className="verify-page">
      <div className="verify-card">
        <div className="verify-brand">DiagLab · Report authenticity</div>
        <h1>Public verification</h1>
        <p className="text-muted">Confirm this report is genuine and was issued by your lab.</p>

        {loading ? <p>Checking report…</p> : null}
        {error ? (
          <div className="verify-status verify-status--bad">
            <ShieldAlert size={28} />
            <div>
              <strong>Could not verify</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : null}

        {result ? (
          result.valid ? (
            <div className="verify-status verify-status--ok">
              <ShieldCheck size={28} />
              <div>
                <strong>Authentic report</strong>
                <p>
                  <CheckCircle2 size={14} style={{ verticalAlign: "middle" }} /> This PDF was issued by the laboratory
                  LIS and has not been tampered with at the source of truth.
                </p>
                <ul className="verify-meta">
                  <li>
                    <span>Order</span>
                    <strong>{result.orderNumber ?? result.orderId}</strong>
                  </li>
                  <li>
                    <span>Patient</span>
                    <strong>{result.patientName ?? "—"}</strong>
                  </li>
                  <li>
                    <span>Verified at</span>
                    <strong>{result.verifiedAt ? new Date(result.verifiedAt).toLocaleString() : "—"}</strong>
                  </li>
                  <li>
                    <span>Report generated</span>
                    <strong>{result.generatedAt ? new Date(result.generatedAt).toLocaleString() : "—"}</strong>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="verify-status verify-status--bad">
              <ShieldAlert size={28} />
              <div>
                <strong>Invalid or forged</strong>
                <p>Token mismatch or report not found. Do not trust this document.</p>
              </div>
            </div>
          )
        ) : null}
      </div>
    </main>
  );
};
