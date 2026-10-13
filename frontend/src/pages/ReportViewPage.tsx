import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FileText, ShieldCheck } from "lucide-react";
import { env } from "../utils/env";

type ReportMeta = {
  orderId: string;
  orderNumber: string;
  patientName: string;
  pdfUrl: string;
};

export const ReportViewPage = (): JSX.Element => {
  const { passcode } = useParams<{ passcode: string }>();
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!passcode) return;
    void (async () => {
      try {
        const res = await fetch(`${env.apiUrl.replace(/\/$/, "")}/api/reports/view/${encodeURIComponent(passcode)}`);
        const json = (await res.json()) as { success?: boolean; data?: ReportMeta; message?: string };
        if (!res.ok || !json.success || !json.data) {
          setError(json.message ?? "Report link is invalid or expired.");
          return;
        }
        setMeta(json.data);
      } catch {
        setError("Unable to load report. Please contact the lab.");
      }
    })();
  }, [passcode]);

  return (
    <section className="page-shell flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600">
          <ShieldCheck size={28} aria-hidden />
        </div>
        <h1 className="page-title mb-2">Your lab report</h1>
        {error ? <p className="status-error">{error}</p> : null}
        {!error && !meta ? <p className="text-muted">Loading secure report…</p> : null}
        {meta ? (
          <>
            <p className="page-subtitle mb-1">{meta.patientName}</p>
            <p className="text-sm text-muted mb-6">Order {meta.orderNumber}</p>
            <a href={meta.pdfUrl} target="_blank" rel="noreferrer" className="btn btn-primary inline-flex items-center gap-2">
              <FileText size={16} aria-hidden />
              View NABL PDF report
            </a>
          </>
        ) : null}
      </div>
    </section>
  );
};
