import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { decryptReportBuffer, nablPdfEngine } from "./nablPdf.engine";
import { reportDistributionService } from "./reportDistribution.service";
import { reportObjectStore } from "./reportObjectStore";
import { resolveOrderByPasscode, reportViewUrl } from "../orders/orderLifecycle.util";
import { env } from "../../config/env";
import { db } from "../../database/postgres";
import { normalizeRole } from "../auth/permissions";

const ok = <T>(res: Response, data: T, status: number = HTTP_STATUS.OK): void => {
  res.status(status).json({ success: true, data });
};

export const downloadOrderReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const orderId = req.params.orderId;
    if (!orderId) {
      throw new AppError("orderId required", HTTP_STATUS.BAD_REQUEST, "ORDER_ID_REQUIRED");
    }

    // Prefer short-lived pre-signed URL (S3 private or local signed token)
    if (req.query.mode === "presign" || req.query.redirect === "1") {
      const signed = await nablPdfEngine.createPresignedUrl(req.tenantId, orderId);
      if (req.query.redirect === "1") {
        res.redirect(signed.url);
        return;
      }
      ok(res, { download: signed });
      return;
    }

    const { encrypted, fileName } = await nablPdfEngine.getEncryptedFile(req.tenantId, orderId);
    const pdf = decryptReportBuffer(encrypted);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("X-Report-Encrypted-At-Rest", "aes-256-gcm");
    res.setHeader("Cache-Control", "no-store");
    res.status(HTTP_STATUS.OK).send(pdf);
  } catch (err) {
    next(err);
  }
};

export const presignOrderReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId) {
      throw new AppError("Tenant context missing", HTTP_STATUS.BAD_REQUEST, "TENANT_REQUIRED");
    }
    const orderId = req.params.orderId!;
    const signed = await nablPdfEngine.createPresignedUrl(req.tenantId, orderId);
    ok(res, { download: signed });
  } catch (err) {
    next(err);
  }
};

/** Public short-lived token download (no session) — token itself is the authz. */
export const downloadPresignedReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.params.token;
    if (!token) throw new AppError("token required", HTTP_STATUS.BAD_REQUEST, "TOKEN_REQUIRED");
    const resolved = await reportObjectStore.resolvePresignToken(token);
    const encrypted = await reportObjectStore.getEncryptedReport(resolved.storageUri);
    const pdf = decryptReportBuffer(encrypted);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${resolved.orderId}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.status(HTTP_STATUS.OK).send(pdf);
  } catch (err) {
    next(err);
  }
};

export const generateOrderReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const orderId = req.params.orderId;
    if (!orderId) {
      throw new AppError("orderId required", HTTP_STATUS.BAD_REQUEST, "ORDER_ID_REQUIRED");
    }
    const report = await nablPdfEngine.generateForOrder({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      orderId
    });
    ok(res, { report });
  } catch (err) {
    next(err);
  }
};

export const distributeOrderReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser?.userId) {
      throw new AppError("Auth/tenant context missing", HTTP_STATUS.BAD_REQUEST, "CONTEXT_REQUIRED");
    }
    const orderId = req.params.orderId;
    if (!orderId) {
      throw new AppError("orderId required", HTTP_STATUS.BAD_REQUEST, "ORDER_ID_REQUIRED");
    }
    const result = await reportDistributionService.distribute({
      tenantId: req.tenantId,
      userId: req.authUser.userId,
      orderId,
      channels: req.body?.channels,
      email: req.body?.email ?? null,
      phone: req.body?.phone ?? null
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const verifyOrderReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orderId = req.params.orderId;
    if (!orderId) {
      throw new AppError("orderId required", HTTP_STATUS.BAD_REQUEST, "ORDER_ID_REQUIRED");
    }
    const token = typeof req.query.t === "string" ? req.query.t : undefined;
    const result = await nablPdfEngine.verifyOrder(orderId, token);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

/** Public patient magic-link metadata + PDF download redirect. */
export const viewReportByPasscode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const passcode = req.params.passcode?.trim();
    if (!passcode) {
      throw new AppError("Passcode required", HTTP_STATUS.BAD_REQUEST, "PASSCODE_REQUIRED");
    }
    const resolved = await resolveOrderByPasscode(passcode);
    if (!resolved) {
      throw new AppError("Invalid or expired report link", HTTP_STATUS.NOT_FOUND, "REPORT_NOT_FOUND");
    }

    if (req.query.download === "1") {
      const { encrypted, fileName } = await nablPdfEngine.getEncryptedFile(resolved.tenantId, resolved.orderId);
      const pdf = decryptReportBuffer(encrypted);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.setHeader("Cache-Control", "no-store");
      res.status(HTTP_STATUS.OK).send(pdf);
      return;
    }

    ok(res, {
      orderId: resolved.orderId,
      orderNumber: resolved.orderNumber,
      patientName: resolved.patientName,
      pdfUrl: `${env.publicApiBaseUrl.replace(/\/$/, "")}/api/reports/view/${passcode}?download=1`
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Patient portal: reports for the logged-in user, matched by email / name / phone-as-email local-part.
 */
export const listMyReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenantId || !req.authUser) {
      throw new AppError("Unauthorized", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const role = normalizeRole(req.authUser.role);
    if (role !== "PATIENT" && role !== "LAB_MANAGER" && role !== "SUPER_ADMIN") {
      throw new AppError("Patient portal only", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    }

    const email = (req.authUser.email ?? "").toLowerCase();
    const name = (req.authUser.name ?? "").trim();
    const localPart = email.includes("@") ? email.split("@")[0]! : email;

    const result = await db.query(
      `SELECT o.id AS order_id,
              o.order_number,
              o.report_passcode,
              o.created_at AS ordered_at,
              p.name AS patient_name,
              p.patient_code,
              r.report_url,
              r.created_at AS report_at
       FROM order_bookings o
       JOIN patients p ON p.id = o.patient_id AND p.tenant_id = o.tenant_id
       LEFT JOIN order_reports r ON r.order_id = o.id AND r.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1
         AND (
           lower(p.patient_code) = lower($2)
           OR lower(p.patient_code) = lower($3)
           OR lower(coalesce(p.phone, '')) = lower($2)
           OR ($4 <> '' AND lower(p.name) = lower($4))
         )
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [req.tenantId, email, localPart, name]
    );

    const reports = result.rows.map((row) => {
      const passcode = row.report_passcode as string | null;
      return {
        orderId: row.order_id as string,
        orderNumber: row.order_number as string,
        patientName: row.patient_name as string,
        patientCode: row.patient_code as string,
        orderedAt: row.ordered_at,
        reportAt: row.report_at,
        hasPdf: Boolean(row.report_url || passcode),
        viewUrl: passcode ? reportViewUrl(passcode) : null,
        passcode
      };
    });

    ok(res, { reports });
  } catch (err) {
    next(err);
  }
};
