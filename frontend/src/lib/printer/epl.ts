import { BarcodeLabelPayload, LabelSizeMm } from "./types";

const defaultSize: Required<LabelSizeMm> = { widthMm: 50, heightMm: 25, dpmm: 8 };

const dots = (mm: number, dpmm: number): number => Math.round(mm * dpmm);

/**
 * Build Eltron EPL2 for TSC / older Xprinter / Godex in EPL mode.
 * Uses `B` barcode + `A` text commands; ends with `P1` print.
 */
export const buildEplLabel = (payload: BarcodeLabelPayload, size: LabelSizeMm = {}): string => {
  const widthMm = size.widthMm ?? defaultSize.widthMm;
  const heightMm = size.heightMm ?? defaultSize.heightMm;
  const dpmm = size.dpmm ?? defaultSize.dpmm;
  const w = dots(widthMm, dpmm);
  const h = dots(heightMm, dpmm);
  const copies = Math.max(1, payload.copies ?? 1);
  const barcode = payload.barcode.replace(/[^\x20-\x7E]/g, "");
  const title = (payload.title ?? "DiagLab").slice(0, 28);
  const line2 = (payload.patientName ?? payload.subtitle ?? "").slice(0, 32);

  // EPL uses inches*dpi-ish; Q sets label height in dots, q sets width
  const lines = [
    "N",
    `q${w}`,
    `Q${h},24`,
    `A20,10,0,3,1,1,N,"${escapeEpl(title)}"`,
    `B20,40,0,1,2,4,60,B,"${escapeEpl(barcode)}"`,
    line2 ? `A20,120,0,2,1,1,N,"${escapeEpl(line2)}"` : "",
    `P${copies}`
  ];
  return lines.filter(Boolean).join("\n") + "\n";
};

const escapeEpl = (s: string): string => s.replace(/"/g, "'");
