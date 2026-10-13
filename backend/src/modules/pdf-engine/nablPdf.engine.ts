import fs from "fs";
import path from "path";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
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

const reportsDir = path.resolve(process.cwd(), "storage", "nabl-reports");

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

const drawHeader = (
  doc: PDFKit.PDFDocument,
  labName: string,
  barcodePng: Buffer,
  nablCert: string,
  branding?: { primaryColor?: string; secondaryColor?: string; labHeaderAddress?: string }
): void => {
  const primary = branding?.primaryColor ?? "#0b5cab";
  const secondary = branding?.secondaryColor ?? "#b91c1c";
  const address = branding?.labHeaderAddress?.trim() || "Main Branch · Lab Complex, City Center · Tel: +91-1800-000-000 · reports@yourlab.com";

  doc.roundedRect(40, 36, 70, 36, 4).fillAndStroke(primary, primary);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(10).text("NABL", 52, 42);
  doc.font("Helvetica").fontSize(6).text(nablCert, 44, 56, { width: 62, align: "center" });

  doc.roundedRect(120, 36, 70, 36, 4).fillAndStroke(secondary, secondary);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(10).text("NABH", 138, 48);

  doc.image(barcodePng, 430, 32, { width: 120, height: 40 });

  doc.fillColor("#000").font("Helvetica-Bold").fontSize(16).text(labName, 40, 80, { align: "center", width: 515 });
  doc.font("Helvetica").fontSize(8).fillColor("#333");
  doc.text("NABL Accredited · ISO 15189:2022 Compliant · NABH Assured", { align: "center" });
  doc.text(address, { align: "center" });
  doc.moveDown(0.4);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke("#999");
  doc.moveDown(0.5);
  doc.fillColor("#000");
};

const drawPatientBox = (
  doc: PDFKit.PDFDocument,
  row: PendingLabResultRow,
  reportTime: string
): void => {
  const y = doc.y;
  doc.rect(40, y, 515, 78).stroke("#444");
  doc.fontSize(8).fillColor("#000");
  doc.font("Helvetica-Bold").text(`UHID: ${row.patientUhid}`, 48, y + 8);
  doc.font("Helvetica").text(`Booking ID: ${row.orderNumber}`, 230, y + 8);
  doc.text(`Patient: ${row.patientName}`, 48, y + 24);
  doc.text(`Age/Gender: ${row.patientAgeYears ?? "—"} / ${row.patientGender ?? "—"}`, 230, y + 24);
  doc.text(`Referred By: ${row.referredDoctor ?? "Self"}`, 400, y + 24, { width: 145 });
  doc.text(
    `Collected: ${row.sampleCollectedAt ? new Date(row.sampleCollectedAt).toLocaleString() : "—"}`,
    48,
    y + 40
  );
  doc.text(
    `Received: ${row.sampleReceivedAt ? new Date(row.sampleReceivedAt).toLocaleString() : "—"}`,
    230,
    y + 40
  );
  doc.text(`Verified: ${reportTime}`, 400, y + 40, { width: 145 });
  doc.fontSize(7).fillColor("#555").text("ISO 15189 — Results for clinical use only", 48, y + 58);
  doc.y = y + 86;
  doc.fillColor("#000");
};

const drawClinicalImpression = (doc: PDFKit.PDFDocument, impression: string): void => {
  if (doc.y > 620) doc.addPage();
  const y = doc.y + 8;
  doc.rect(40, y, 515, 52).fillAndStroke("#eff6ff", "#0b5cab");
  doc.fillColor("#0b5cab").font("Helvetica-Bold").fontSize(9).text("Clinical Impression (MD Pathologist)", 48, y + 8);
  doc.fillColor("#111").font("Helvetica").fontSize(8).text(impression, 48, y + 22, { width: 498, lineGap: 2 });
  doc.y = y + 58;
  doc.fillColor("#000");
};

const drawPatientSummaryPage = (
  doc: PDFKit.PDFDocument,
  labName: string,
  patientName: string,
  summary: PatientSummaryOutput
): void => {
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#0284c7").text("Smart Patient Summary", { align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#444").text(`${labName} · Prepared for ${patientName}`, { align: "center" });
  doc.moveDown(0.8);
  doc.roundedRect(40, doc.y, 515, 200, 8).stroke("#cbd5e1");
  const boxY = doc.y + 14;
  doc.font("Helvetica").fontSize(10).fillColor("#111");
  let offsetY = boxY;
  for (const bullet of summary.bullets) {
    doc.text(bullet, 52, offsetY, { width: 490, lineGap: 4 });
    offsetY += 36;
  }
  doc.y = boxY + 200;
  doc.moveDown(0.5);
  doc.font("Helvetica-Oblique").fontSize(7).fillColor("#64748b").text(summary.disclaimer, { align: "center", width: 515 });
  doc.font("Helvetica").fontSize(6).fillColor("#94a3b8").text(
    `AI-assisted summary · ${summary.provider}/${summary.model} · Not a substitute for medical consultation`,
    { align: "center" }
  );
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
    const tenantConfig = await tenantService.resolveTenantConfiguration(input.tenantId);
    const profile = await labResultService.getPathologistProfile(input.tenantId, input.userId);
    const sigRow = (
      await db.query(
        `SELECT pathologist_name, pathologist_license, pathologist_signature_url FROM lab_results WHERE id = $1`,
        [first.labResultId]
      )
    ).rows[0] as {
      pathologist_name: string | null;
      pathologist_license: string | null;
      pathologist_signature_url: string | null;
    };

    const verifyToken = crypto.randomBytes(16).toString("hex");
    const verifyUrl = `${env.publicVerifyBaseUrl}/${input.orderId}?t=${verifyToken}`;
    const qrPng = await QRCode.toBuffer(verifyUrl, { type: "png", width: 120, margin: 1 });
    const barcodePng = await bwipjs.toBuffer({
      bcid: "code128",
      text: first.orderNumber,
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: "center"
    });

    const nablCert = tenantConfig.branding?.nablRegNo || process.env.NABL_CERTIFICATE_NUMBER || "MC-1234";
    const labName = tenantConfig.brandingName || "DiagLab Diagnostics";
    const pdfBranding = tenantConfig.branding
      ? {
          primaryColor: tenantConfig.branding.primaryColor,
          secondaryColor: tenantConfig.branding.secondaryColor,
          labHeaderAddress: tenantConfig.branding.labHeaderAddress
        }
      : undefined;

    // Group by department
    const byDept = new Map<string, PendingLabResultRow[]>();
    for (const r of verifiedRows) {
      const list = byDept.get(r.departmentName) ?? [];
      list.push(r);
      byDept.set(r.departmentName, list);
    }

    let patientSummary: PatientSummaryOutput | null = null;
    if (env.aiPatientSummaryInPdf) {
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

      drawHeader(doc, labName, barcodePng, nablCert, pdfBranding);
      const reportTime = new Date().toLocaleString();
      drawPatientBox(doc, first, reportTime);

      const cols = [40, 175, 240, 290, 430];

      for (const [dept, rows] of byDept) {
        if (doc.y > 680) doc.addPage();
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#0b5cab").text(dept.toUpperCase(), { underline: true });
        doc.fillColor("#000").moveDown(0.3);
        doc.font("Helvetica-Bold").fontSize(7);
        const headerY = doc.y;
        doc.text("Test / Parameter", cols[0], headerY);
        doc.text("Value", cols[1], headerY);
        doc.text("Unit", cols[2], headerY);
        doc.text("Biological Ref. Interval", cols[3], headerY);
        doc.text("Methodology", cols[4], headerY, { width: 120 });
        doc.moveDown(0.6);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke("#bbb");
        doc.moveDown(0.25);

        for (const result of rows) {
          doc.font("Helvetica-Bold").fontSize(8).text(result.testName);
          doc.font("Helvetica").fontSize(8);
          for (const e of result.entries) {
            if (doc.y > 700) doc.addPage();
            const y = doc.y;
            const valueLabel = e.value == null ? e.valueText ?? "—" : String(e.value);
            let display = valueLabel;
            if (e.flag === "H" || e.flag === "L") display = `${valueLabel} (${e.flag})`;
            if (e.isCritical || e.flag === "CRITICAL") display = `${valueLabel} CRITICAL`;

            if (e.isCritical || e.flag === "CRITICAL") {
              doc.fillColor("#b91c1c").font("Helvetica-Bold");
            } else if (e.isAbnormal || e.flag === "H" || e.flag === "L") {
              doc.fillColor("#000").font("Helvetica-Bold");
            } else {
              doc.fillColor("#000").font("Helvetica");
            }

            doc.text(e.parameterName, cols[0], y, { width: 130 });
            doc.text(display, cols[1], y, { width: 60 });
            doc.font("Helvetica").fillColor("#000");
            doc.text(e.unit ?? "—", cols[2], y, { width: 40 });
            doc.text(e.referenceRange, cols[3], y, { width: 130 });
            doc.text(e.methodology ?? "CLIA / Photometry", cols[4], y, { width: 120 });
            doc.y = y + 12;
          }
          doc.moveDown(0.35);
        }
        doc.moveDown(0.4);
      }

      if (input.clinicalImpression?.trim()) {
        drawClinicalImpression(doc, input.clinicalImpression.trim());
      }

      if (doc.y > 640) doc.addPage();
      const qrY = doc.y;
      doc.image(qrPng, 40, qrY, { width: 70, height: 70 });
      doc.fontSize(8).fillColor("#000").text("Scan for anti-forgery verification", 120, qrY + 12);
      doc.fillColor("#0b5cab").text(verifyUrl, 120, qrY + 28, { width: 380, link: verifyUrl });

      doc.y = qrY + 82;
      doc.fillColor("#000");
      const sigY = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).text("Lab Technician", 48, sigY);
      doc.font("Helvetica").fontSize(8);
      doc.text("Name: ________________", 48, sigY + 14);
      doc.text("Qualification: B.Sc. MLT", 48, sigY + 28);
      doc.text("Signature: ________________", 48, sigY + 42);

      const pathName = sigRow?.pathologist_name ?? profile.fullName;
      const license = sigRow?.pathologist_license ?? profile.medicalLicenseNumber;
      doc.font("Helvetica-Bold").fontSize(9).text("MD Pathologist", 320, sigY);
      doc.font("Helvetica").fontSize(8);
      doc.text(`Name: ${pathName}`, 320, sigY + 14);
      doc.text(`MCI / DMC Reg No.: ${license}`, 320, sigY + 28);
      const sig = sigRow?.pathologist_signature_url ?? profile.digitalSignatureUrl;
      doc.text(sig ? `e-Signature: on file` : "Signature: ________________", 320, sigY + 42);
      if (sig) doc.fontSize(6).fillColor("#555").text(sig, 320, sigY + 54, { width: 200 });

      doc.y = sigY + 75;
      doc.fontSize(7).fillColor("#444").text(
        "NABL / ISO 15189 Disclaimer: This report is intended for clinical diagnostic purposes and must be interpreted by a qualified physician in correlation with clinical findings. Partial reproduction is prohibited without laboratory authorization. Results relate only to the sample tested.",
        { width: 515 }
      );

      if (patientSummary) {
        drawPatientSummaryPage(doc, labName, first.patientName, patientSummary);
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor("#666").text(`Page ${i - range.start + 1} of ${range.count}`, 40, 820, {
          align: "center",
          width: 515
        });
      }

      doc.end();
    });

    const encrypted = encryptBuffer(plainPdf);
    // Always keep a local AES-GCM copy for failover, then push to private S3 when configured
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
