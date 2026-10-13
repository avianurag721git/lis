import { ChangeEvent, DragEvent, useCallback, useState } from "react";
import { Camera, FileImage, Loader2, ScanLine } from "lucide-react";
import { ocrApi, PrescriptionOcrMatch } from "./ocr.service";
import { CatalogTest } from "./orders.service";

type Props = {
  tests: CatalogTest[];
  onApply: (result: PrescriptionOcrMatch) => void;
};

const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const [, meta, body] = dataUrl.match(/^data:(.*?);base64,(.*)$/) ?? [];
      if (!body) {
        reject(new Error("Invalid image"));
        return;
      }
      resolve({ base64: body, mimeType: meta ?? file.type ?? "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const PrescriptionOcrCapture = ({ onApply }: Props): JSX.Element => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PrescriptionOcrMatch | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File): Promise<void> => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a prescription photo (JPEG/PNG).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { base64, mimeType } = await fileToBase64(file);
      setPreview(URL.createObjectURL(file));
      const result = await ocrApi.parsePrescription(base64, mimeType);
      setLastResult(result);
      onApply(result);
    } catch {
      setError("Could not read prescription. Try a clearer photo.");
    } finally {
      setBusy(false);
    }
  }, [onApply]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ScanLine className="h-4 w-4 text-primary" aria-hidden />
        Scan prescription (camera or upload — no scanner needed)
      </div>

      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/10" : "border-border/60"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {preview ? (
          <img src={preview} alt="Prescription preview" className="mx-auto max-h-40 rounded-md object-contain" />
        ) : (
          <FileImage className="mx-auto h-10 w-10 text-muted-foreground mb-2" aria-hidden />
        )}
        <p className="text-sm text-muted-foreground">Drag & drop prescription photo here</p>
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            <Camera className="h-4 w-4" aria-hidden />
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={onFileChange}
              disabled={busy}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-border px-3 py-2 text-sm">
            Upload image
            <input type="file" accept="image/*" className="sr-only" onChange={onFileChange} disabled={busy} />
          </label>
        </div>
      </div>

      {busy ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading prescription with AI…
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {lastResult ? (
        <div className="text-xs space-y-1 rounded-lg bg-background/80 p-3 border border-border/40">
          <p>
            <strong>Detected:</strong> {lastResult.extracted.detectedTests.join(", ") || "—"}
          </p>
          <p>
            <strong>Matched tests:</strong> {lastResult.matchedTests.map((m) => m.testName).join(", ") || "none"}
          </p>
          {lastResult.unmatchedTests.length ? (
            <p className="text-amber-600">Unmatched: {lastResult.unmatchedTests.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
