import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, ShieldAlert } from "lucide-react";
import { LabResultEntry } from "./labResults.service";

/** Absolute physiological guardrails (human limits) for common parameters. */
const PHYSIO_LIMITS: Array<{ match: RegExp; min: number; max: number; label: string }> = [
  { match: /hemoglobin|hb\b/i, min: 3, max: 25, label: "Hemoglobin" },
  { match: /wbc|white blood|leucocyte/i, min: 1000, max: 100000, label: "WBC" },
  { match: /platelet|plt/i, min: 5000, max: 1500000, label: "Platelets" },
  { match: /glucose|sugar|fbs|rbs/i, min: 20, max: 800, label: "Glucose" },
  { match: /creatinine/i, min: 0.1, max: 30, label: "Creatinine" },
  { match: /hba1c/i, min: 3, max: 20, label: "HbA1c" }
];

export type VoiceDraft = {
  parameterId: string;
  value: string;
  blocked: boolean;
  blockReason: string | null;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: { [index: number]: { [index: number]: { transcript: string } } }; length: number }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const getPhysioLimit = (
  parameterName: string,
  refMin: number | null,
  refMax: number | null
): { min: number; max: number; label: string } => {
  for (const rule of PHYSIO_LIMITS) {
    if (rule.match.test(parameterName)) return rule;
  }
  if (refMin != null && refMax != null) {
    const span = refMax - refMin;
    return {
      min: Math.max(0, refMin - span * 2),
      max: refMax + span * 3,
      label: parameterName
    };
  }
  return { min: 0, max: 999999, label: parameterName };
};

const parseVoicePairs = (transcript: string): Array<{ name: string; value: string }> => {
  const pairs: Array<{ name: string; value: string }> = [];
  const parts = transcript
    .replace(/,/g, " ")
    .split(/\s+(?=[A-Za-z])/)
    .join(" ")
    .split(/(?:\band\b|,)/i);

  for (const chunk of parts) {
    const m = chunk.trim().match(/^([a-zA-Z][a-zA-Z\s./()-]{1,40}?)\s+(\d+\.?\d*)/);
    if (m) pairs.push({ name: m[1]!.trim(), value: m[2]! });
  }

  if (pairs.length === 0) {
    const global = transcript.matchAll(/([a-zA-Z][a-zA-Z\s./()-]{2,30}?)\s+(\d+\.?\d*)/g);
    for (const m of global) pairs.push({ name: m[1]!.trim(), value: m[2]! });
  }
  return pairs;
};

const matchEntry = (spoken: string, entries: LabResultEntry[]): LabResultEntry | undefined => {
  const needle = spoken.toLowerCase();
  return entries.find(
    (e) =>
      e.parameterName.toLowerCase().includes(needle) ||
      needle.includes(e.parameterName.toLowerCase()) ||
      (e.formulaAlias && needle.includes(e.formulaAlias.toLowerCase()))
  );
};

type Props = {
  entries: LabResultEntry[];
  voiceDrafts: Record<string, VoiceDraft>;
  onVoiceDrafts: (drafts: Record<string, VoiceDraft>) => void;
  onConfirm: (parameterId: string) => void;
};

export const VoiceResultDictation = ({ entries, voiceDrafts, onVoiceDrafts, onConfirm }: Props): JSX.Element => {
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    recognitionRef.current = rec;
  }, []);

  const applyTranscript = useCallback(
    (transcript: string) => {
      setLastTranscript(transcript);
      const pairs = parseVoicePairs(transcript);
      const next = { ...voiceDrafts };

      for (const pair of pairs) {
        const entry = matchEntry(pair.name, entries);
        if (!entry || entry.isCalculated) continue;

        const num = Number(pair.value);
        if (!Number.isFinite(num)) continue;

        const limit = getPhysioLimit(entry.parameterName, entry.referenceMin, entry.referenceMax);
        const blocked = num < limit.min || num > limit.max;
        next[entry.parameterId] = {
          parameterId: entry.parameterId,
          value: pair.value,
          blocked,
          blockReason: blocked
            ? `Value ${num} is outside human range for ${limit.label} (${limit.min}–${limit.max})`
            : null
        };
      }
      onVoiceDrafts(next);
    },
    [entries, onVoiceDrafts, voiceDrafts]
  );

  const toggleListen = (): void => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      applyTranscript(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };

  const pendingConfirm = Object.values(voiceDrafts).filter((d) => !d.blocked);

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Voice dictation (3-layer safety shield)</p>
        <button
          type="button"
          onClick={toggleListen}
          disabled={!supported}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            listening ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
          }`}
        >
          {listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          {listening ? "Stop" : "Speak results"}
        </button>
      </div>

      {!supported ? (
        <p className="text-xs text-muted-foreground">Web Speech API not supported in this browser.</p>
      ) : null}

      {lastTranscript ? (
        <p className="text-xs text-muted-foreground font-mono">Heard: &quot;{lastTranscript}&quot;</p>
      ) : null}

      {Object.values(voiceDrafts).map((d) => (
        <div
          key={d.parameterId}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
            d.blocked ? "bg-red-500/10 border border-red-500/30" : "bg-amber-400/15 border border-amber-400/40"
          }`}
        >
          <span>
            {d.blocked ? (
              <span className="text-red-600 flex items-center gap-1">
                <ShieldAlert className="h-4 w-4" aria-hidden />❌ {d.blockReason}
              </span>
            ) : (
              <>Draft: <strong>{d.value}</strong> — press Confirm or Enter in cell</>
            )}
          </span>
          {!d.blocked ? (
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => onConfirm(d.parameterId)}>
              Confirm
            </button>
          ) : null}
        </div>
      ))}

      {pendingConfirm.length > 0 ? (
        <p className="text-xs text-amber-700">
          Layer 1: Yellow draft · Layer 2: Range guard · Layer 3: Manual confirm required
        </p>
      ) : null}
    </div>
  );
};
