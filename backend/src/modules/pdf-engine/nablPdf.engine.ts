import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import http from "http";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import bwipjs from "bwip-js/node";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { tenantService } from "../tenant/tenant.service";
import { labResultService } from "../lab-results/labResult.service";
import { PendingLabResultRow } from "../lab-results/labResult.types";
import { reportObjectStore } from "./reportObjectStore";
import { aiPathologistService, flattenVerifiedResults } from "../ai-pathologist/aiPathologist.service";
import { PatientSummaryOutput } from "../ai-pathologist/aiPathologist.types";
import { TenantBranding, TenantConfiguration } from "../tenant/tenant.types";
import { defaultBranding } from "../saas/saas.types";
import {
  ReportLayoutConfig,
  ReportPatientFieldId,
  isFieldEnabled,
  parseReportLayout,
  sortedEnabled
} from "../saas/reportLayout.types";
import { formatIsoDateDisplay, resolvePatientAge } from "../../common/age/patientAge";
import { LabResultEntryDto } from "../lab-results/labResult.types";

const reportsDir = path.resolve(process.cwd(), "storage", "nabl-reports");

const PAGE = {
  left: 40,
  right: 555,
  width: 515,
  contentTop: 168,
  contentBottom: 760,
  footerY: 768
};

const ensureDir = async (): Promise<void> => {
  await fs.promises.mkdir(reportsDir, { recursive: true });
};

const encryptBuffer = (plain: Buffer): Buffer => {
  const key = crypto.createHash("sha256").update(env.reportEncryptionKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
};

export const decryptReportBuffer = (payload: Buffer): Buffer => {
  const key = crypto.createHash("sha256").update(env.reportEncryptionKey).digest();
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

const formatDt = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDob = (dob: string | null | undefined): string => formatIsoDateDisplay(dob);

const ageYearsForReport = (row: PendingLabResultRow): number | null => {
  try {
    const resolved = resolvePatientAge({
      dateOfBirth: row.patientDob,
      ageYears: row.patientAgeYears
    });
    return resolved.ageYears;
  } catch {
    return row.patientAgeYears != null ? Math.floor(row.patientAgeYears) : null;
  }
};

const hasReportableValue = (e: LabResultEntryDto): boolean => {
  if (e.id.startsWith("draft:")) return false;
  if (e.value != null && Number.isFinite(e.value)) return true;
  const text = e.valueText?.trim();
  return Boolean(text && text !== "—" && text !== "-");
};

/** Strip duplicated unit suffix from catalog names like "Lymphocytes %". */
const displayParameterName = (name: string, unit: string | null): string => {
  const u = unit?.trim();
  if (!u) return name;
  const trimmed = name.trim();
  if (trimmed.endsWith(` ${u}`)) return trimmed.slice(0, -(u.length + 1)).trim();
  if (trimmed.endsWith(u) && trimmed.length > u.length) {
    return trimmed.slice(0, -u.length).trim();
  }
  return trimmed;
};

/**
 * Result table columns (fixed so H/L never collides with the value).
 * Unit column is intentionally wider for values like mL/min/1.73m2.
 */
const COL = {
  paramX: 40,
  paramW: 150,
  resultX: 195,
  resultW: 46,
  flagX: 244,
  flagW: 16,
  unitX: 264,
  unitW: 92,
  refX: 362,
  refW: 183
};

/** PDFKit leaves doc.x at the right after lineBreak:false cells — always reset before flow text. */
const resetFlow = (doc: PDFKit.PDFDocument): void => {
  doc.x = PAGE.left;
};

const leftText = (
  doc: PDFKit.PDFDocument,
  text: string,
  opts: {
    fontSize?: number;
    color?: string;
    font?: string;
    underline?: boolean;
    lineGap?: number;
  } = {}
): void => {
  resetFlow(doc);
  if (opts.font) doc.font(opts.font);
  if (opts.fontSize) doc.fontSize(opts.fontSize);
  if (opts.color) doc.fillColor(opts.color);
  doc.text(text, PAGE.left, doc.y, {
    width: PAGE.width,
    align: "left",
    lineBreak: true,
    underline: opts.underline,
    lineGap: opts.lineGap
  });
};

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    if (url.startsWith("data:image/")) {
      const b64 = url.split(",")[1];
      if (!b64) return null;
      return Buffer.from(b64, "base64");
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return await new Promise<Buffer | null>((resolve) => {
        const client = url.startsWith("https://") ? https : http;
        const req = client.get(url, { timeout: 5000 }, (res) => {
          if ((res.statusCode ?? 500) >= 400) {
            resolve(null);
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
          req.destroy();
          resolve(null);
        });
      });
    }
    if (fs.existsSync(url)) {
      return await fs.promises.readFile(url);
    }
  } catch {
    return null;
  }
  return null;
};

type ReportContext = {
  labName: string;
  branding: TenantBranding;
  layout: ReportLayoutConfig;
  first: PendingLabResultRow;
  reportedAt: string;
  pathologistLine: string;
  pathologistName: string;
  barcodePng: Buffer;
  logoPng: Buffer | null;
  detailed: boolean;
};

const resolveLayout = (branding: TenantBranding): ReportLayoutConfig =>
  parseReportLayout(branding.reportLayout ?? null);

const drawLetterhead = (doc: PDFKit.PDFDocument, ctx: ReportContext): number => {
  const { branding, labName, barcodePng, logoPng, layout } = ctx;
  const primary = branding.primaryColor || "#0b5cab";
  const secondary = branding.secondaryColor || "#b91c1c";
  const header = layout.header;
  let x = PAGE.left;

  for (const field of sortedEnabled(header.fields, "left")) {
    if (field.id === "logo" && logoPng) {
      try {
        doc.image(logoPng, x, 28, { fit: [56, 40] });
        x += 64;
      } catch {
        /* ignore bad logo */
      }
    } else if (field.id === "nablBadge") {
      doc.roundedRect(x, 28, 58, 34, 3).fillAndStroke(primary, primary);
      doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text("NABL", x + 14, 34);
      const reg = branding.nablRegNo?.trim();
      if (reg) {
        doc.font("Helvetica").fontSize(5).text(reg, x + 4, 48, { width: 50, align: "center" });
      }
      x += 66;
    } else if (field.id === "nabhBadge") {
      doc.roundedRect(x, 28, 58, 34, 3).fillAndStroke(secondary, secondary);
      doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text("NABH", x + 14, 40);
      x += 66;
    }
  }

  if (isFieldEnabled(header.fields, "barcode")) {
    try {
      doc.image(barcodePng, 430, 26, { width: 120, height: 36 });
    } catch {
      /* ignore bad barcode */
    }
  }

  const titleAlign = header.titleAlign || "center";
  const contactAlign = header.contactAlign || "center";
  doc.y = 72;

  for (const field of sortedEnabled(header.fields, "center")) {
    if (field.id === "labName" && labName.trim()) {
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(14).text(labName, PAGE.left, doc.y, {
        align: field.align ?? titleAlign,
        width: PAGE.width
      });
    } else if (field.id === "accreditationLine" && branding.accreditationLine?.trim()) {
      doc.font("Helvetica").fontSize(7).fillColor("#333").text(branding.accreditationLine.trim(), PAGE.left, doc.y, {
        align: field.align ?? titleAlign,
        width: PAGE.width
      });
    }
  }

  const contactBits: string[] = [];
  for (const field of sortedEnabled(header.fields, "center")) {
    if (field.id === "address" && branding.labHeaderAddress?.trim()) {
      contactBits.push(branding.labHeaderAddress.trim());
    } else if (field.id === "phone" && branding.phone?.trim()) {
      contactBits.push(`Tel: ${branding.phone.trim()}`);
    } else if (field.id === "email" && branding.email?.trim()) {
      contactBits.push(`Email: ${branding.email.trim()}`);
    } else if (field.id === "website" && branding.website?.trim()) {
      contactBits.push(branding.website.trim());
    }
  }
  if (contactBits.length) {
    doc.font("Helvetica").fontSize(7).fillColor("#333").text(contactBits.join(" · "), PAGE.left, doc.y, {
      align: contactAlign,
      width: PAGE.width
    });
  }

  const y = doc.y + 4;
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).stroke("#999");
  return y + 6;
};

const patientFieldValue = (
  id: ReportPatientFieldId,
  ctx: ReportContext
): { label: string; value: string; bold?: boolean } | null => {
  const row = ctx.first;
  const ageYears = ageYearsForReport(row);
  const ageGender = [ageYears != null ? `${Math.floor(ageYears)} Years` : null, row.patientGender]
    .filter(Boolean)
    .join(" / ");

  switch (id) {
    case "patientName":
      return row.patientName?.trim() ? { label: "Name", value: row.patientName.trim(), bold: true } : null;
    case "dob": {
      const dob = formatDob(row.patientDob);
      return dob && dob !== "—" ? { label: "DOB", value: dob } : null;
    }
    case "ageGender":
      return ageGender ? { label: "Age/Gender", value: ageGender } : null;
    case "patientId":
      return row.patientUhid?.trim() ? { label: "Patient ID", value: row.patientUhid.trim() } : null;
    case "labId":
      return row.orderNumber?.trim() ? { label: "Lab ID", value: row.orderNumber.trim() } : null;
    case "status":
      return { label: "Status", value: "Final" };
    case "referredBy":
      return { label: "Ref By", value: (row.referredDoctor ?? "Self").trim() || "Self" };
    case "collectedAt": {
      const v = formatDt(row.sampleCollectedAt);
      return v !== "—" ? { label: "Collected", value: v } : null;
    }
    case "receivedAt": {
      const v = formatDt(row.sampleReceivedAt);
      return v !== "—" ? { label: "Received", value: v } : null;
    }
    case "reportedAt": {
      const v = formatDt(ctx.reportedAt);
      return v !== "—" ? { label: "Reported", value: v } : null;
    }
    case "sampleQuality":
      return row.sampleQuality?.trim()
        ? { label: "Sample Quality", value: row.sampleQuality.trim() }
        : null;
    case "phone":
      return row.patientPhone?.trim() ? { label: "Phone", value: row.patientPhone.trim() } : null;
    default:
      return null;
  }
};

const drawPatientHeader = (doc: PDFKit.PDFDocument, ctx: ReportContext, topY: number): number => {
  const columns = ctx.layout.patient.columns === 2 ? 2 : 3;
  const colKeys = columns === 2 ? (["left", "right"] as const) : (["left", "middle", "right"] as const);
  const colXs =
    columns === 2
      ? [PAGE.left + 8, PAGE.left + 8 + PAGE.width / 2]
      : [PAGE.left + 8, 230, 400];
  const colWidth = columns === 2 ? PAGE.width / 2 - 16 : 145;

  const linesByCol = colKeys.map((group) => {
    const fields = sortedEnabled(ctx.layout.patient.fields, group);
    const lines: Array<{ label: string; value: string; bold?: boolean }> = [];
    for (const field of fields) {
      const resolved = patientFieldValue(field.id, ctx);
      if (resolved) lines.push(resolved);
    }
    // Fields assigned to middle when only 2 columns are rendered → fold into left
    return lines;
  });

  if (columns === 2) {
    const middleExtras = sortedEnabled(ctx.layout.patient.fields, "middle")
      .map((f) => patientFieldValue(f.id, ctx))
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
    linesByCol[0] = [...linesByCol[0]!, ...middleExtras];
  }

  const rowCount = Math.max(1, ...linesByCol.map((c) => c.length));
  const boxH = Math.max(40, 8 + rowCount * 16);
  doc.rect(PAGE.left, topY, PAGE.width, boxH).stroke("#444");
  doc.fontSize(8).fillColor("#000");

  colKeys.forEach((_, colIdx) => {
    const lines = linesByCol[colIdx] ?? [];
    const x = colXs[colIdx]!;
    lines.forEach((line, i) => {
      const y = topY + 6 + i * 16;
      const text = `${line.label}: ${line.value}`;
      doc.font(line.bold ? "Helvetica-Bold" : "Helvetica").fillColor("#000").text(text, x, y, {
        width: colWidth,
        lineBreak: false
      });
    });
  });

  resetFlow(doc);
  return topY + boxH + 10;
};

const beginContentPage = (doc: PDFKit.PDFDocument, ctx: ReportContext): void => {
  doc.addPage();
  const afterLetterhead = drawLetterhead(doc, ctx);
  doc.y = drawPatientHeader(doc, ctx, afterLetterhead);
  resetFlow(doc);
};

const ensureContentSpace = (doc: PDFKit.PDFDocument, needed: number, ctx: ReportContext): void => {
  if (doc.y + needed <= PAGE.contentBottom) return;
  beginContentPage(doc, ctx);
};

const drawColumnHeaders = (doc: PDFKit.PDFDocument): void => {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#000");
  doc.text("Parameter", COL.paramX, y, { width: COL.paramW, lineBreak: false });
  doc.text("Result", COL.resultX, y, { width: COL.resultW + COL.flagW, lineBreak: false });
  doc.text("Unit", COL.unitX, y, { width: COL.unitW, lineBreak: false });
  doc.text("Biological Ref. Interval", COL.refX, y, { width: COL.refW, lineBreak: false });
  doc.moveTo(PAGE.left, y + 12).lineTo(PAGE.right, y + 12).stroke("#bbb");
  doc.x = PAGE.left;
  doc.y = y + 16;
};

/** Page-break helper that re-prints column headers when a results table continues. */
const ensureTableRowSpace = (doc: PDFKit.PDFDocument, needed: number, ctx: ReportContext): void => {
  if (doc.y + needed <= PAGE.contentBottom) return;
  beginContentPage(doc, ctx);
  drawColumnHeaders(doc);
};

const drawResultRow = (doc: PDFKit.PDFDocument, e: LabResultEntryDto, y: number): number => {
  const valueLabel = e.value == null ? String(e.valueText ?? "").trim() : String(e.value);
  let flag = "";
  if (e.flag === "H" || e.flag === "L") flag = e.flag;
  else if (e.isCritical || e.flag === "CRITICAL") flag = "H";
  else if (e.isAbnormal && e.referenceMax != null && e.value != null && e.value > e.referenceMax) flag = "H";
  else if (e.isAbnormal && e.referenceMin != null && e.value != null && e.value < e.referenceMin) flag = "L";

  const critical = e.isCritical || e.flag === "CRITICAL";
  const abnormal = critical || e.isAbnormal || flag === "H" || flag === "L";
  const paramLabel = displayParameterName(e.parameterName, e.unit);

  doc.fontSize(8);
  doc.fillColor(critical ? "#b91c1c" : "#000").font(abnormal ? "Helvetica-Bold" : "Helvetica");
  doc.text(paramLabel, COL.paramX, y, { width: COL.paramW, lineBreak: false });
  doc.text(valueLabel, COL.resultX, y, { width: COL.resultW, lineBreak: false });
  if (flag) {
    doc.fillColor("#b91c1c").font("Helvetica-Bold").text(flag, COL.flagX, y, {
      width: COL.flagW,
      align: "center",
      lineBreak: false
    });
  }
  doc.font("Helvetica").fillColor("#000");
  const unit = e.unit ?? "";
  // Long units (eGFR) use a slightly smaller size so they stay on one line in the unit column
  doc.fontSize(unit.length > 12 ? 6.5 : 8).text(unit, COL.unitX, y + (unit.length > 12 ? 1 : 0), {
    width: COL.unitW,
    lineBreak: false
  });
  doc.fontSize(8).text(e.referenceRange && e.referenceRange !== "—" ? e.referenceRange : "", COL.refX, y, {
    width: COL.refW,
    lineBreak: false
  });
  resetFlow(doc);
  return y + 14;
};

const drawTestBlock = (
  doc: PDFKit.PDFDocument,
  result: PendingLabResultRow,
  ctx: ReportContext
): void => {
  const reportable = result.entries.filter(hasReportableValue);
  if (reportable.length === 0) return;

  ensureContentSpace(doc, 60, ctx);
  const method =
    reportable.find((e) => e.methodology)?.methodology ?? "CLIA / Photometry";
  const specimen = result.testSampleType ?? result.sampleType ?? "—";

  leftText(doc, result.testName.toUpperCase(), {
    font: "Helvetica-Bold",
    fontSize: 10,
    color: "#0b5cab"
  });
  leftText(doc, `Specimen: ${specimen}    Method: ${method}`, {
    font: "Helvetica",
    fontSize: 7,
    color: "#333"
  });
  doc.moveDown(0.25);
  resetFlow(doc);
  drawColumnHeaders(doc);

  for (const e of reportable) {
    ensureTableRowSpace(doc, 16, ctx);
    doc.y = drawResultRow(doc, e, doc.y);
  }

  if (ctx.detailed && result.technicianNote?.trim()) {
    ensureContentSpace(doc, 40, ctx);
    doc.moveDown(0.35);
    leftText(doc, "Clinical significance / Comments", {
      font: "Helvetica-Bold",
      fontSize: 8,
      color: "#0b5cab"
    });
    leftText(doc, result.technicianNote.trim(), {
      font: "Helvetica",
      fontSize: 7,
      color: "#111",
      lineGap: 1
    });
  }
  resetFlow(doc);
  doc.moveDown(0.55);
  doc.fillColor("#000");
};

const drawClinicalImpression = (doc: PDFKit.PDFDocument, impression: string, ctx: ReportContext): void => {
  const bodyHeight = doc.heightOfString(impression, { width: 498, lineGap: 2 });
  const boxH = Math.max(48, 28 + bodyHeight);
  ensureContentSpace(doc, boxH + 12, ctx);
  const y = doc.y;
  doc.rect(PAGE.left, y, PAGE.width, boxH).fillAndStroke("#eff6ff", "#0b5cab");
  doc.fillColor("#0b5cab").font("Helvetica-Bold").fontSize(9).text("Clinical Impression (MD Pathologist)", 48, y + 6);
  doc.fillColor("#111").font("Helvetica").fontSize(8).text(impression, 48, y + 20, { width: 498, lineGap: 2 });
  doc.y = y + boxH + 10;
  doc.fillColor("#000");
};

const drawSignaturesAndQr = async (
  doc: PDFKit.PDFDocument,
  ctx: ReportContext,
  verifyUrl: string,
  qrPng: Buffer | null,
  signaturePng: Buffer | null
): Promise<void> => {
  const footer = ctx.layout.footer;
  const showBanner = isFieldEnabled(footer.fields, "endOfReport");
  const showQr = isFieldEnabled(footer.fields, "qrCode") && Boolean(qrPng);
  const showQrCaption = isFieldEnabled(footer.fields, "qrCaption");
  const showDesignation = isFieldEnabled(footer.fields, "pathologistDesignation");
  const showName = isFieldEnabled(footer.fields, "pathologistName");
  const showSignature = isFieldEnabled(footer.fields, "signature");

  // Clear gap between last result row and the End Of Report marker
  resetFlow(doc);
  doc.y += 36;
  ensureContentSpace(doc, 160, ctx);
  resetFlow(doc);
  doc.y += 18;

  if (showBanner) {
    doc.font("Helvetica").fontSize(9).fillColor("#000").text(
      "------------------ End Of Report ------------------",
      PAGE.left,
      doc.y,
      { align: "center", width: PAGE.width, lineBreak: false }
    );
    doc.y += 20;
  }

  const qrY = doc.y;
  let leftBottom = qrY;
  let rightBottom = qrY;

  if (showQr && qrPng) {
    try {
      doc.image(qrPng, PAGE.left, qrY, { width: 56, height: 56 });
      leftBottom = Math.max(leftBottom, qrY + 56);
    } catch {
      /* skip broken QR */
    }
  }

  if (showQrCaption) {
    const captionX = showQr ? 108 : PAGE.left;
    doc.fontSize(8).fillColor("#000").text("Scan QR to verify report authenticity", captionX, qrY + 8, {
      width: 220,
      lineBreak: false
    });
    doc.fontSize(7).fillColor("#555").text("Do not trust a report without a valid QR check.", captionX, qrY + 24, {
      width: 220,
      lineBreak: false
    });
    let hostLabel = "verification link";
    try {
      hostLabel = new URL(verifyUrl).host;
    } catch {
      /* keep fallback */
    }
    doc.fillColor("#0b5cab").fontSize(7).text(`Verify online · ${hostLabel}`, captionX, qrY + 40, {
      width: 220,
      link: verifyUrl,
      lineBreak: false
    });
    leftBottom = Math.max(leftBottom, qrY + 56);
  }

  const sigX = 360;
  let sigY = qrY;
  for (const field of sortedEnabled(footer.fields, "right")) {
    if (field.id === "pathologistDesignation" && showDesignation) {
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(9).text("MD Pathologist", sigX, sigY, {
        width: 180,
        lineBreak: false
      });
      sigY += 14;
    } else if (field.id === "pathologistName" && showName && ctx.pathologistLine.trim()) {
      doc.font("Helvetica").fontSize(8).fillColor("#000").text(ctx.pathologistLine, sigX, sigY, {
        width: 180,
        lineBreak: false
      });
      sigY += 14;
    } else if (field.id === "signature" && showSignature) {
      if (ctx.detailed && signaturePng) {
        try {
          doc.image(signaturePng, sigX, sigY, { fit: [110, 32] });
          sigY += 34;
        } catch {
          doc.fontSize(7).fillColor("#555").text("e-Signature on file", sigX, sigY, { lineBreak: false });
          sigY += 12;
        }
      } else if (ctx.detailed) {
        doc.fontSize(7).fillColor("#555").text("e-Signature on file", sigX, sigY, { lineBreak: false });
        sigY += 12;
      }
    }
  }
  rightBottom = Math.max(rightBottom, sigY);

  doc.x = PAGE.left;
  doc.y = Math.max(leftBottom, rightBottom, qrY) + 12;
  doc.fillColor("#000");
};

/** Continues on the current page (only page-breaks if needed for space). */
const drawPatientSummarySection = (
  doc: PDFKit.PDFDocument,
  ctx: ReportContext,
  labName: string,
  patientName: string,
  summary: PatientSummaryOutput
): void => {
  const bullets = summary.bullets ?? [];
  const approxHeight = 56 + bullets.length * 22 + (summary.disclaimer ? 24 : 0);
  ensureContentSpace(doc, Math.min(approxHeight, 160), ctx);
  resetFlow(doc);
  doc.moveDown(0.35);

  leftText(doc, "Smart Patient Summary", {
    font: "Helvetica-Bold",
    fontSize: 12,
    color: "#0284c7"
  });
  leftText(doc, `${labName} · ${patientName}`, {
    font: "Helvetica",
    fontSize: 8,
    color: "#333"
  });
  doc.moveDown(0.25);
  leftText(doc, "Summary", { font: "Helvetica-Bold", fontSize: 10, color: "#000" });

  for (const bullet of bullets) {
    ensureContentSpace(doc, 28, ctx);
    leftText(doc, `• ${bullet}`, { font: "Helvetica", fontSize: 8, color: "#111", lineGap: 1 });
  }

  if (summary.disclaimer) {
    ensureContentSpace(doc, 24, ctx);
    doc.moveDown(0.2);
    leftText(doc, summary.disclaimer, { font: "Helvetica", fontSize: 7, color: "#555" });
  }
  resetFlow(doc);
  doc.fillColor("#000");
};

const stampPageChrome = (doc: PDFKit.PDFDocument, ctx: ReportContext, pageIndex: number, pageCount: number): void => {
  const footer = ctx.layout.footer;
  doc.fontSize(7).fillColor("#444");

  if (isFieldEnabled(footer.fields, "processedAt")) {
    const processed = ctx.branding.processedAtLabel?.trim()
      ? `Processed At: ${ctx.branding.processedAtLabel.trim()}`
      : `Processed At: ${ctx.labName}`;
    doc.text(processed, PAGE.left, PAGE.footerY, { width: 200 });
  }

  if (isFieldEnabled(footer.fields, "pathologistName") && ctx.pathologistLine.trim()) {
    doc.text(ctx.pathologistLine, 220, PAGE.footerY, { width: 220 });
  }

  if (isFieldEnabled(footer.fields, "pageNumber")) {
    doc.text(`Page ${pageIndex} of ${pageCount}`, 450, PAGE.footerY, { width: 100, align: "right" });
  }

  if (isFieldEnabled(footer.fields, "hlLegend")) {
    doc.fontSize(6).text("H-High   L- Low", PAGE.left, PAGE.footerY + 12);
  }

  if (isFieldEnabled(footer.fields, "disclaimer")) {
    const disclaimer = (ctx.branding.reportDisclaimer || defaultBranding().reportDisclaimer).trim();
    if (disclaimer) {
      doc.fontSize(6).text(disclaimer, PAGE.left, PAGE.footerY + 22, { width: PAGE.width });
    }
  }
};

export const nablPdfEngine = {
  async generateForOrder(input: {
    tenantId: string;
    userId: string;
    orderId: string;
    clinicalImpression?: string;
    patientSummaryLanguage?: "en" | "hi";
  }): Promise<{ orderId: string; reportUrl: string; verifyUrl: string; filePath: string }> {
    await ensureDir();
    const verifiedRows = await labResultService.listVerifiedForOrder(input.tenantId, input.orderId);
    if (verifiedRows.length === 0) {
      throw new AppError("No pathologist-verified results for this order", HTTP_STATUS.BAD_REQUEST, "NOT_VERIFIED");
    }

    const first = verifiedRows[0]!;
    const tenantConfig: TenantConfiguration = await tenantService.resolveTenantConfiguration(input.tenantId);
    const branding: TenantBranding = { ...defaultBranding(), ...(tenantConfig.branding ?? {}) };
    const layout = resolveLayout(branding);
    branding.reportLayout = layout;
    const detailed = tenantConfig.reportTemplate === "DETAILED";
    const profile = await labResultService.getPathologistProfile(input.tenantId, input.userId);

    const pathName = first.pathologistName ?? profile.fullName;
    const license = first.pathologistLicense ?? profile.medicalLicenseNumber;
    const signatureUrl = first.pathologistSignatureUrl ?? profile.digitalSignatureUrl;
    const pathologistLine = `${pathName}${license ? ` (${license})` : ""}`;

    const reportedAt =
      verifiedRows
        .map((r) => r.verifiedAt)
        .filter((v): v is string => Boolean(v))
        .sort()
        .slice(-1)[0] ?? new Date().toISOString();

    const verifyToken = crypto.randomBytes(16).toString("hex");
    const verifyUrl = `${env.publicVerifyBaseUrl}/${input.orderId}?t=${verifyToken}`;
    let qrPng: Buffer | null = null;
    try {
      qrPng = await QRCode.toBuffer(verifyUrl, { type: "png", width: 120, margin: 1 });
    } catch {
      qrPng = null;
    }
    const barcodePng = await bwipjs.toBuffer({
      bcid: "code128",
      text: first.orderNumber,
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: "center"
    });

    const labName = tenantConfig.brandingName || "DiagLab Diagnostics";
    const logoPng =
      isFieldEnabled(layout.header.fields, "logo") && branding.logoUrl
        ? await fetchImageBuffer(branding.logoUrl)
        : null;
    const signaturePng = signatureUrl ? await fetchImageBuffer(signatureUrl) : null;

    const ctx: ReportContext = {
      labName,
      branding,
      layout,
      first,
      reportedAt,
      pathologistLine,
      pathologistName: pathName,
      barcodePng,
      logoPng,
      detailed
    };

    // Group by department for section order; still print each test as its own block
    const byDept = new Map<string, PendingLabResultRow[]>();
    for (const r of verifiedRows) {
      const list = byDept.get(r.departmentName) ?? [];
      list.push(r);
      byDept.set(r.departmentName, list);
    }

    const includePatientSummary =
      isFieldEnabled(layout.sections.fields, "patientSummary") && env.aiPatientSummaryInPdf !== false;

    let patientSummary: PatientSummaryOutput | null = null;
    if (includePatientSummary) {
      try {
        patientSummary = await aiPathologistService.patientSummary({
          language: input.patientSummaryLanguage ?? env.aiPatientSummaryLanguage,
          patientAgeYears: first.patientAgeYears,
          patientGender: first.patientGender,
          testName: verifiedRows.map((r) => r.testName).join(", "),
          testResults: flattenVerifiedResults(verifiedRows)
        });
      } catch {
        patientSummary = null;
      }
    }

    const plainPdf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const afterLetterhead = drawLetterhead(doc, ctx);
      doc.y = drawPatientHeader(doc, ctx, afterLetterhead);

      for (const [dept, rows] of byDept) {
        ensureContentSpace(doc, 28, ctx);
        leftText(doc, dept.toUpperCase(), {
          font: "Helvetica-Bold",
          fontSize: 11,
          color: "#0b5cab",
          underline: true
        });
        resetFlow(doc);
        doc.fillColor("#000").moveDown(0.3);
        for (const result of rows) {
          drawTestBlock(doc, result, ctx);
        }
      }

      if (detailed && input.clinicalImpression?.trim()) {
        drawClinicalImpression(doc, input.clinicalImpression.trim(), ctx);
      }

      void drawSignaturesAndQr(doc, ctx, verifyUrl, qrPng, signaturePng).then(() => {
      if (patientSummary) {
          drawPatientSummarySection(doc, ctx, labName, first.patientName, patientSummary);
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
          stampPageChrome(doc, ctx, i - range.start + 1, range.count);
      }
      doc.end();
      }).catch(reject);
    });

    const encrypted = encryptBuffer(plainPdf);
    await ensureDir();
    const localPath = path.join(reportsDir, `${input.orderId}.pdf.enc`);
    await fs.promises.writeFile(localPath, encrypted);
    const stored = await reportObjectStore.putEncryptedReport(input.tenantId, input.orderId, encrypted);
    const filePath = stored.storageUri;

    const reportUrl = `/api/reports/download/${input.orderId}`;
    await db.query(
      `INSERT INTO order_reports (id, tenant_id, order_id, file_path, verify_token, report_url, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, order_id) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         verify_token = EXCLUDED.verify_token,
         report_url = EXCLUDED.report_url,
         updated_at = NOW()`,
      [crypto.randomUUID(), input.tenantId, input.orderId, filePath, verifyToken, reportUrl, input.userId]
    );

    return { orderId: input.orderId, reportUrl, verifyUrl, filePath };
  },

  async getEncryptedFile(
    tenantId: string,
    orderId: string
  ): Promise<{ storageUri: string; fileName: string; encrypted: Buffer }> {
    const row = (
      await db.query(`SELECT file_path FROM order_reports WHERE tenant_id = $1 AND order_id = $2 LIMIT 1`, [
        tenantId,
        orderId
      ])
    ).rows[0];
    if (!row) {
      throw new AppError("Report not found for order", HTTP_STATUS.NOT_FOUND, "REPORT_NOT_FOUND");
    }
    const storageUri = row.file_path as string;
    const encrypted = await reportObjectStore.getEncryptedReport(storageUri);
    return { storageUri, fileName: `${orderId}.pdf`, encrypted };
  },

  async createPresignedUrl(tenantId: string, orderId: string) {
    const { storageUri } = await this.getEncryptedFile(tenantId, orderId);
    return reportObjectStore.createPresignedDownloadUrl({ tenantId, orderId, storageUri });
  },

  async verifyOrder(
    orderId: string,
    token?: string
  ): Promise<{
    valid: boolean;
    orderId: string;
    generatedAt: string | null;
    orderNumber?: string;
    patientName?: string;
    verifiedAt?: string | null;
  }> {
    const row = (
      await db.query(
        `SELECT r.verify_token, r.created_at, o.order_number, p.name AS patient_name,
                (SELECT MAX(lr.verified_at) FROM lab_results lr WHERE lr.order_id = r.order_id) AS verified_at
         FROM order_reports r
         JOIN order_bookings o ON o.id = r.order_id
         JOIN patients p ON p.id = o.patient_id
         WHERE r.order_id = $1
         LIMIT 1`,
        [orderId]
      )
    ).rows[0];
    if (!row) return { valid: false, orderId, generatedAt: null };
    if (token && row.verify_token !== token) return { valid: false, orderId, generatedAt: null };
    return {
      valid: true,
      orderId,
      generatedAt: new Date(row.created_at).toISOString(),
      orderNumber: row.order_number,
      patientName: row.patient_name,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null
    };
  }
};
