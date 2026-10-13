import { BarcodeLabelPayload, LabelSizeMm } from "./types";

const defaultSize: Required<LabelSizeMm> = { widthMm: 50, heightMm: 25, dpmm: 8 };

const dots = (mm: number, dpmm: number): number => Math.round(mm * dpmm);

/**
 * Build Zebra ZPL (^XA…^XZ) for a sample barcode label.
 * Compatible with Zebra ZD/ZT and most ZPL clones (TSC, Xprinter ZPL mode).
 */
export const buildZplLabel = (payload: BarcodeLabelPayload, size: LabelSizeMm = {}): string => {
  const widthMm = size.widthMm ?? defaultSize.widthMm;
  const heightMm = size.heightMm ?? defaultSize.heightMm;
  const dpmm = size.dpmm ?? defaultSize.dpmm;
  const w = dots(widthMm, dpmm);
  const h = dots(heightMm, dpmm);
  const copies = Math.max(1, payload.copies ?? 1);
  const barcode = payload.barcode.replace(/[^\x20-\x7E]/g, "");
  const title = (payload.title ?? "DiagLab").slice(0, 28);
  const line2 = (payload.patientName ?? payload.subtitle ?? "").slice(0, 32);
  const line3 = (payload.sampleType ?? "").slice(0, 24);

  const lines = [
    "^XA",
    `^PW${w}`,
    `^LL${h}`,
    "^LH0,0",
    "^CI28",
    `^FO20,12^A0N,22,22^FD${escapeZpl(title)}^FS`,
    `^FO20,40^BY2,2,60^BCN,60,Y,N,N^FD${escapeZpl(barcode)}^FS`,
    line2 ? `^FO20,120^A0N,18,18^FD${escapeZpl(line2)}^FS` : "",
    line3 ? `^FO20,142^A0N,16,16^FD${escapeZpl(line3)}^FS` : "",
    `^PQ${copies},0,1,Y`,
    "^XZ"
  ];
  return lines.filter(Boolean).join("\n");
};

const escapeZpl = (s: string): string => s.replace(/([\\^~])/g, "\\$1");
