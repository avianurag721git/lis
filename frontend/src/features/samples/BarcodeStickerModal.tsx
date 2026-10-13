import { useState } from "react";
import { createPortal } from "react-dom";
import Barcode from "react-barcode";
import { Printer, X } from "lucide-react";
import type { SampleDto } from "../orders/orders.service";
import type { Patient } from "../../modules/patients/patients.service";
import { formatPatientAge } from "../../utils/patientAge";

type PrintLayout = "a4-sheet" | "label-printer" | "thermal-direct";

type Props = {
  open: boolean;
  onClose: () => void;
  patient: Patient | null;
  samples: SampleDto[];
  orderNumber?: string | undefined;
};

const tubeCss: Record<string, string> = {
  PURPLE: "#6b21a8",
  LAVENDER: "#7c3aed",
  RED: "#b91c1c",
  GOLD: "#ca8a04",
  YELLOW: "#ca8a04",
  GREEN: "#15803d",
  BLUE: "#1d4ed8",
  GREY: "#4b5563",
  GRAY: "#4b5563"
};

const LABEL_W_IN = 2;
const LABEL_H_IN = 1;

const A4_PRINT_CSS = `
  @page { size: A4; margin: 8mm; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sticker-sheet {
    display: grid;
    grid-template-columns: repeat(3, 2in);
    grid-auto-rows: 1in;
    gap: 4mm;
    margin: 0;
  }
  .tube-sticker {
    box-sizing: border-box;
    width: 2in;
    height: 1in;
    overflow: hidden;
    margin: 0;
    padding: 0.06in 0.08in;
    border: 0.5pt solid #111;
    border-radius: 0;
    background: #fff;
    color: #000;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .tube-sticker__meta {
    display: flex;
    flex-direction: column;
    gap: 0;
    font: 600 7.5pt/1.15 Arial, Helvetica, sans-serif;
    color: #000;
  }
  .tube-sticker__name { font-size: 8.5pt; font-weight: 700; }
  .tube-sticker__tube { font-size: 7pt; font-weight: 700; }
  .tube-sticker__barcode { width: 100%; overflow: hidden; line-height: 0; }
  .tube-sticker__barcode svg {
    display: block;
    width: 1.82in !important;
    max-width: 100% !important;
    height: 0.34in !important;
  }
`;

const hexToRgb = (hex: string): [number, number, number] => {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const svgElementToPngDataUrl = (svg: SVGElement): Promise<string> =>
  new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGElement;
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    const width = Number(clone.getAttribute("width")) || svg.clientWidth || 180;
    const height = Number(clone.getAttribute("height")) || svg.clientHeight || 40;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * 2));
      canvas.height = Math.max(1, Math.round(height * 2));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterize barcode"));
    };
    img.src = url;
  });

type LabelDraft = {
  name: string;
  ageGender: string;
  uhid: string;
  tubeLine: string;
  accent: string;
  barcodePng: string;
};

const buildLabelDrafts = async (source: HTMLElement): Promise<LabelDraft[]> => {
  const stickers = Array.from(source.querySelectorAll<HTMLElement>(".tube-sticker"));
  const drafts: LabelDraft[] = [];

  for (const sticker of stickers) {
    const name =
      sticker.querySelector(".tube-sticker__name")?.textContent?.trim() || "Patient";
    const metaSpans = Array.from(sticker.querySelectorAll(".tube-sticker__meta > span"));
    const ageGender = metaSpans[0]?.textContent?.trim() || "—";
    const uhid = metaSpans[1]?.textContent?.trim() || "UHID: —";
    const tubeEl = sticker.querySelector<HTMLElement>(".tube-sticker__tube");
    const tubeLine = tubeEl?.textContent?.trim() || "";
    const accent = tubeEl?.style.color || sticker.style.borderColor || "#111827";
    const svg = sticker.querySelector("svg");
    if (!svg) continue;
    const barcodePng = await svgElementToPngDataUrl(svg);
    drafts.push({ name, ageGender, uhid, tubeLine, accent, barcodePng });
  }

  return drafts;
};

/** Build a real 2″×1″ PDF so browsers/PDF printers cannot fall back to A4. */
const printLabelPdf = async (source: HTMLElement, fileBase?: string): Promise<void> => {
  const drafts = await buildLabelDrafts(source);
  if (drafts.length === 0) return;

  // Lazy-load so a slow/failed jspdf fetch cannot block the SPA boot.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "in",
    format: [LABEL_W_IN, LABEL_H_IN],
    orientation: "landscape",
    compress: true
  });

  drafts.forEach((label, index) => {
    if (index > 0) doc.addPage([LABEL_W_IN, LABEL_H_IN], "landscape");

    const [r, g, b] = hexToRgb(label.accent.startsWith("#") ? label.accent : "#111827");
    doc.setDrawColor(17, 17, 17);
    doc.setLineWidth(0.01);
    doc.rect(0.02, 0.02, LABEL_W_IN - 0.04, LABEL_H_IN - 0.04);

    const left = 0.08;
    let y = 0.16;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label.name.slice(0, 28), left, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    y += 0.14;
    doc.text(label.ageGender.slice(0, 32), left, y);
    y += 0.12;
    doc.text(label.uhid.slice(0, 36), left, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(r, g, b);
    y += 0.12;
    doc.text(label.tubeLine.slice(0, 36), left, y);

    const barcodeW = 1.82;
    const barcodeH = 0.34;
    const barcodeX = (LABEL_W_IN - barcodeW) / 2;
    const barcodeY = LABEL_H_IN - barcodeH - 0.06;
    doc.addImage(label.barcodePng, "PNG", barcodeX, barcodeY, barcodeW, barcodeH);
  });

  doc.setProperties({
    title: `${fileBase ?? "tube-labels"} · 2×1″ labels`,
    subject: "Tube barcode stickers"
  });
  // Ask the PDF viewer to open the system print dialog (page size is already 2×1″).
  doc.autoPrint();

  const url = doc.output("bloburl");
  const win = window.open(url, "_blank");
  if (!win) {
    // Pop-up blocked — still give an exact-size file the user can print.
    doc.save(`${fileBase ?? "tube-labels"}-2x1.pdf`);
    URL.revokeObjectURL(url);
    return;
  }
  win.focus();
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
};

const printA4Sheet = (html: string): void => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:8.27in;height:11.69in;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tube labels</title><style>${A4_PRINT_CSS}</style></head><body>${html}</body></html>`
  );
  doc.close();

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const triggerPrint = (): void => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.addEventListener("afterprint", cleanup, { once: true });
    win.print();
    window.setTimeout(cleanup, 120000);
  };

  window.setTimeout(triggerPrint, 50);
};

/** Printable 2" × 1" Code128 thermal tube stickers */
export const BarcodeStickerModal = ({ open, onClose, patient, samples, orderNumber }: Props): JSX.Element | null => {
  const [printLayout, setPrintLayout] = useState<PrintLayout>("label-printer");
  const [printing, setPrinting] = useState(false);

  if (!open) return null;

  const printStickers = (): void => {
    const source = document.getElementById("sticker-print-source");
    if (!source || printing) return;

    if (printLayout === "a4-sheet") {
      printA4Sheet(source.innerHTML);
      return;
    }

    setPrinting(true);

    if (printLayout === "thermal-direct") {
      void (async () => {
        try {
          const { printBarcodeLabel, PrinterError } = await import("../../lib/printer");
          let sent = 0;
          for (const s of samples) {
            try {
              await printBarcodeLabel({
                barcode: s.barcode,
                title: patient?.name ?? "Patient",
                subtitle: orderNumber ? `Order ${orderNumber}` : undefined,
                patientName: patient?.name,
                sampleType: `${s.sampleType} · ${s.tubeColor}`,
                copies: 1
              });
              sent += 1;
            } catch (err) {
              if (err instanceof PrinterError) {
                // Fall back to browser 2×1 PDF for remaining labels
                await printLabelPdf(source, orderNumber);
                window.alert(
                  `Thermal print unavailable (${err.message}). Opened the 2″×1″ PDF dialog instead. Sent ${sent} label(s) to the printer before fallback.`
                );
                return;
              }
              throw err;
            }
          }
          if (sent === 0) {
            await printLabelPdf(source, orderNumber);
          }
        } catch {
          try {
            await printLabelPdf(source, orderNumber);
            window.alert("Thermal transport failed — opened the 2″×1″ PDF print dialog instead.");
          } catch {
            window.alert("Could not print labels. Allow pop-ups and try Label printer (PDF) mode.");
          }
        } finally {
          setPrinting(false);
        }
      })();
      return;
    }

    void printLabelPdf(source, orderNumber)
      .catch(() => {
        window.alert(
          "Could not open the 2×1″ label PDF. Check that pop-ups are allowed, then try again."
        );
      })
      .finally(() => setPrinting(false));
  };

  const ageGender = [formatPatientAge(patient, true), patient?.gender ?? null]
    .filter(Boolean)
    .join(" / ");

  return createPortal(
    <div className="modal-backdrop sticker-modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel sticker-modal-panel">
        <div className="sticker-modal-toolbar no-print">
          <h2 className="card-title sticker-modal-title">
            Tube barcodes {orderNumber ? `(${orderNumber})` : ""}
          </h2>
          <div className="sticker-modal-actions">
            <label className="sticker-print-layout">
              <span className="sticker-print-layout__label">Print layout</span>
              <select
                className="sticker-print-layout__select"
                value={printLayout}
                onChange={(e) => setPrintLayout(e.target.value as PrintLayout)}
              >
                <option value="label-printer">Label printer — 2″ × 1″ PDF</option>
                <option value="thermal-direct">Thermal direct — ZPL/WebUSB (fallback to PDF)</option>
                <option value="a4-sheet">A4 sheet — pack labels on page</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={printStickers}
              disabled={printing}
            >
              <Printer size={14} aria-hidden />
              {printing ? "Preparing…" : "Print stickers"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              <X size={14} aria-hidden />
              Close
            </button>
          </div>
        </div>

        <p className="text-muted sticker-modal-hint no-print">
          {samples.length} sticker{samples.length === 1 ? "" : "s"} — preview below (~2″ × 1″ each).{" "}
          {printLayout === "a4-sheet"
            ? "A4 sheet mode places multiple labels on one page to reduce wasted paper."
            : printLayout === "thermal-direct"
              ? "Tries WebHID → WebUSB → local agent (ws://127.0.0.1:9101). If no printer is available, falls back to the 2″×1″ PDF dialog."
              : "Label printer mode builds a real 2″ × 1″ PDF (not A4). In the print dialog, choose your label printer or Print to PDF, and turn off Headers and footers."}
        </p>

        <div id="sticker-print-source" className="sticker-print-area">
          <div className="sticker-sheet">
            {samples.map((s) => {
              const tubeColor = s.tubeColor.toUpperCase();
              const accent = tubeCss[tubeColor] ?? "#111827";
              return (
                <div key={s.id} className="tube-sticker" style={{ borderColor: accent }}>
                  <div className="tube-sticker__meta">
                    <strong className="tube-sticker__name">{patient?.name ?? "Patient"}</strong>
                    <span>{ageGender || "—"}</span>
                    <span>UHID: {patient?.uhid ?? patient?.patientCode ?? "—"}</span>
                    <span className="tube-sticker__tube" style={{ color: accent }}>
                      {s.tubeColor} · {s.sampleType}
                    </span>
                  </div>
                  <div className="tube-sticker__barcode">
                    <Barcode
                      value={s.barcode}
                      format="CODE128"
                      width={1}
                      height={32}
                      displayValue
                      fontSize={9}
                      margin={0}
                      background="#ffffff"
                      lineColor="#000000"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
