import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { aiPathologistApi } from "./aiPathologist.service";
import type { PathologistQueueItem } from "./pathologist.service";
import { StatusBadge } from "../../components/StatusBadge";

type Props = {
  item: PathologistQueueItem | null;
  draftImpression: string;
  onDraftChange: (text: string) => void;
};

export const AiCoPathologistWidget = ({ item, draftImpression, onDraftChange }: Props): JSX.Element | null => {
  const [summaryLang, setSummaryLang] = useState<"en" | "hi">("en");
  const [patientBullets, setPatientBullets] = useState<string[]>([]);

  const analyzeMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("No selection");
      return aiPathologistApi.analyzeResult(item);
    },
    onSuccess: (data) => {
      onDraftChange(data.clinicalImpression);
    }
  });

  const summaryMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("No selection");
      return aiPathologistApi.patientSummary(item, summaryLang);
    },
    onSuccess: (data) => {
      setPatientBullets(data.bullets);
    }
  });

  useEffect(() => {
    if (!item) {
      onDraftChange("");
      setPatientBullets([]);
      return;
    }
    analyzeMutation.mutate();
  }, [item?.labResultId]);

  if (!item) return null;

  const isLoading = analyzeMutation.isPending;
  const meta = analyzeMutation.data;

  return (
    <div className="glass-card mt-4 space-y-3 border-medical-indigo/20 !p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-medical-cyan to-medical-indigo text-white">
            <Brain size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Co-Pathologist Insights</h3>
            <p className="text-xs text-foreground-muted">Draft impression for MD review — not a final diagnosis</p>
          </div>
        </div>
        {meta?.fallback ? (
          <StatusBadge label="Rule-based draft" variant="warning" pulse={false} />
        ) : meta ? (
          <StatusBadge label={`${meta.provider} · ${meta.model}`} variant="tracking" pulse={false} />
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Loader2 size={16} className="spin" />
          Analyzing results…
        </div>
      ) : (
        <>
          <label className="block text-xs font-medium text-foreground-muted">
            Clinical impression (editable)
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={draftImpression}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="AI draft will appear here…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary-premium btn-sm"
              disabled={analyzeMutation.isPending}
              onClick={() => analyzeMutation.mutate()}
            >
              <RefreshCw size={14} />
              Regenerate
            </button>
            <button
              type="button"
              className="btn-ghost-premium btn-sm"
              onClick={() => onDraftChange(analyzeMutation.data?.clinicalImpression ?? draftImpression)}
            >
              <Sparkles size={14} />
              Reset to AI draft
            </button>
          </div>
        </>
      )}

      <div className="border-t border-border pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-foreground-muted">Patient summary preview (for PDF)</span>
          <select
            value={summaryLang}
            onChange={(e) => setSummaryLang(e.target.value as "en" | "hi")}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
          <button
            type="button"
            className="btn-ghost-premium btn-sm"
            disabled={summaryMutation.isPending}
            onClick={() => summaryMutation.mutate()}
          >
            {summaryMutation.isPending ? <Loader2 size={14} className="spin" /> : "Generate preview"}
          </button>
        </div>
        {patientBullets.length > 0 ? (
          <ul className="space-y-1 text-xs text-foreground-muted">
            {patientBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-foreground-subtle">Included on final PDF report page when enabled.</p>
        )}
      </div>
    </div>
  );
};
