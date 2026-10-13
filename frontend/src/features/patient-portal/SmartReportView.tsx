import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Download, Volume2, VolumeX } from "lucide-react";
import { env } from "../../utils/env";
import {
  buildReportReadoutScript,
  ReadoutLanguage,
  ReportSummaryLine,
  speakReportSummary,
  stopReadout
} from "../../lib/audioReadout";

type MagicReport = {
  patientName: string;
  orderNumber: string;
  summaryLines: ReportSummaryLine[];
  downloadUrl: string;
  verifyUrl: string;
};

const LANG_OPTIONS: Array<{ code: ReadoutLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "mr", label: "मराठी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "es", label: "Español" }
];

export const SmartReportView = (): JSX.Element => {
  const { token = "" } = useParams();
  const [report, setReport] = useState<MagicReport | null>(null);
  const [lang, setLang] = useState<ReadoutLanguage>("en");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Invalid report link");
      return;
    }
    void axios
      .get<{ success: boolean; data: MagicReport }>(`${env.apiUrl}/api/kiosk/magic-report/${token}`)
      .then((res) => setReport(res.data.data))
      .catch(() => setError("Report link expired or not found."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => () => stopReadout(), []);

  const listen = (): void => {
    if (!report) return;
    if (speaking) {
      stopReadout();
      setSpeaking(false);
      return;
    }
    const script = buildReportReadoutScript(report.patientName, report.summaryLines, lang);
    speakReportSummary(script, lang, () => setSpeaking(false));
    setSpeaking(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-4 py-6 text-center">
        <h1 className="text-xl font-semibold">Your lab report</h1>
        {report ? <p className="text-sm text-muted-foreground mt-1">{report.patientName} · {report.orderNumber}</p> : null}
      </header>

      <main className="mx-auto max-w-md px-4 py-8 space-y-6">
        {loading ? <p className="text-center text-muted-foreground">Loading report…</p> : null}
        {error ? <p className="text-center text-destructive">{error}</p> : null}

        {report ? (
          <>
            <div className="grid gap-3">
              {report.summaryLines.slice(0, 8).map((line) => (
                <div
                  key={line.parameterName}
                  className={`rounded-xl border px-4 py-3 ${
                    line.status === "abnormal" ? "border-amber-500/40 bg-amber-500/5" : "border-border/60"
                  }`}
                >
                  <p className="text-sm text-muted-foreground">{line.parameterName}</p>
                  <p className="text-2xl font-semibold">
                    {line.value ?? "—"}
                    {line.unit ? <span className="text-sm font-normal text-muted-foreground ml-1">{line.unit}</span> : null}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-muted-foreground">Listen language</label>
              <select
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-lg"
                value={lang}
                onChange={(e) => setLang(e.target.value as ReadoutLanguage)}
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={listen}
                className="w-full flex items-center justify-center gap-3 rounded-2xl bg-primary text-primary-foreground py-5 text-lg font-semibold shadow-lg"
              >
                {speaking ? <VolumeX className="h-7 w-7" aria-hidden /> : <Volume2 className="h-7 w-7" aria-hidden />}
                {speaking ? "Stop" : `Listen to Report (${LANG_OPTIONS.find((l) => l.code === lang)?.label})`}
              </button>

              <a
                href={report.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-primary text-primary py-5 text-lg font-semibold"
              >
                <Download className="h-7 w-7" aria-hidden />
                Download Official PDF Report
              </a>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              No app install · No password · Open link from SMS/WhatsApp
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
};
