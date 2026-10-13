import { randomUUID, randomBytes } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ordersService } from "../orders/orders.service";
import { patientsRepository } from "../patients/patients.repository";
import { cashierService } from "../cashier/cashier.service";
import { nablPdfEngine } from "../pdf-engine/nablPdf.engine";
import { emitKioskTokenCreated } from "../../realtime/sampleEvents";

export type QueueToken = {
  id: string;
  tenantId: string;
  orderId: string;
  patientId: string;
  tokenLabel: string;
  queueNumber: number;
  status: string;
  mobile: string | null;
  amountMinor: number;
  paymentStatus: string;
  createdAt: string;
  expiresAt: string;
};

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const nextTokenLabel = async (tenantId: string): Promise<{ label: string; queueNumber: number }> => {
  const day = new Date().toISOString().slice(0, 10);
  const result = await db.query(
    `SELECT COUNT(*)::int AS c FROM queue_tokens WHERE tenant_id = $1 AND created_at::date = $2::date`,
    [tenantId, day]
  );
  const n = ((result.rows[0]?.c as number) ?? 0) + 1;
  const letter = String.fromCharCode(65 + (Math.floor(n / 100) % 26));
  return { label: `Token #${letter}-${String(n).padStart(2, "0")}`, queueNumber: n };
};

const mapToken = (r: Record<string, unknown>): QueueToken => ({
  id: r.id as string,
  tenantId: r.tenant_id as string,
  orderId: r.order_id as string,
  patientId: r.patient_id as string,
  tokenLabel: r.token_label as string,
  queueNumber: Number(r.queue_number),
  status: r.status as string,
  mobile: (r.mobile as string | null) ?? null,
  amountMinor: Number(r.amount_minor),
  paymentStatus: r.payment_status as string,
  createdAt: new Date(r.created_at as string).toISOString(),
  expiresAt: new Date(r.expires_at as string).toISOString()
});

export const kioskService = {
  async getCatalog(tenantId: string) {
    return ordersService.listCatalog(tenantId);
  },

  async bookAndToken(
    tenantId: string,
    input: {
      mobile: string;
      patientName?: string;
      testIds: string[];
      paymentReference?: string;
    }
  ): Promise<{ order: Awaited<ReturnType<typeof ordersService.book>>["order"]; token: QueueToken; upiUri: string }> {
    ensurePg();
    if (!input.testIds.length) {
      throw new AppError("Select at least one test", HTTP_STATUS.BAD_REQUEST, "TESTS_REQUIRED");
    }

    const mobile = input.mobile.replace(/\D/g, "");
    const { patient } = await patientsRepository.createOrFind(tenantId, {
      name: input.patientName?.trim() || `Walk-in ${mobile.slice(-4)}`,
      mobile,
      phone: mobile.length >= 10 ? `+${mobile}` : mobile
    });

    const booked = await ordersService.book(tenantId, env.analyzerSystemUserId, {
      patientId: patient.id,
      collectionType: "WALK_IN",
      items: input.testIds.map((testId) => ({ itemType: "TEST" as const, testId, quantity: 1 }))
    });

    const { label, queueNumber } = await nextTokenLabel(tenantId);
    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const insert = await db.query(
      `INSERT INTO queue_tokens
       (id, tenant_id, order_id, patient_id, token_label, queue_number, mobile, amount_minor, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        tokenId,
        tenantId,
        booked.order.id,
        patient.id,
        label,
        queueNumber,
        mobile,
        booked.order.netAmountMinor,
        expiresAt.toISOString()
      ]
    );

    const token = mapToken(insert.rows[0]);
    const upiUri = `upi://pay?pa=${encodeURIComponent(env.kioskUpiVpa)}&pn=${encodeURIComponent("DiagLab")}&am=${(booked.order.netAmountMinor / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(label)}`;

    emitKioskTokenCreated(tenantId, {
      tokenId: token.id,
      tokenLabel: token.tokenLabel,
      orderNumber: booked.order.orderNumber,
      patientName: patient.name,
      amountMinor: token.amountMinor
    });

    if (input.paymentReference?.trim()) {
      await this.confirmPayment(tenantId, token.id, input.paymentReference.trim());
      token.paymentStatus = "PAID";
    }

    return { order: booked.order, token, upiUri };
  },

  async confirmPayment(tenantId: string, tokenId: string, transactionReference: string): Promise<QueueToken> {
    ensurePg();
    const row = await db.query(`SELECT * FROM queue_tokens WHERE tenant_id = $1 AND id = $2`, [tenantId, tokenId]);
    if (!row.rows[0]) {
      throw new AppError("Token not found", HTTP_STATUS.NOT_FOUND, "TOKEN_NOT_FOUND");
    }
    const token = mapToken(row.rows[0]);
    if (token.paymentStatus === "PAID") return token;

    await cashierService.collectPayment(tenantId, env.analyzerSystemUserId, "TENANT_ADMIN", {
      orderId: token.orderId,
      amountMinor: token.amountMinor,
      method: "UPI",
      transactionReference
    });

    const updated = await db.query(
      `UPDATE queue_tokens SET payment_status = 'PAID' WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, tokenId]
    );
    return mapToken(updated.rows[0]);
  },

  async getToken(tenantId: string, tokenId: string): Promise<QueueToken | null> {
    ensurePg();
    const row = await db.query(`SELECT * FROM queue_tokens WHERE tenant_id = $1 AND id = $2`, [tenantId, tokenId]);
    return row.rows[0] ? mapToken(row.rows[0]) : null;
  },

  async listWaitingTokens(tenantId: string): Promise<QueueToken[]> {
    ensurePg();
    const rows = await db.query(
      `SELECT * FROM queue_tokens WHERE tenant_id = $1 AND status = 'WAITING' ORDER BY created_at ASC LIMIT 50`,
      [tenantId]
    );
    return rows.rows.map(mapToken);
  }
};

export const smartReportService = {
  generateMagicToken(): string {
    return randomBytes(3).toString("hex");
  },

  async createMagicLink(tenantId: string, orderId: string): Promise<{ token: string; url: string }> {
    ensurePg();
    const existing = await db.query(
      `SELECT token FROM report_magic_links WHERE tenant_id = $1 AND order_id = $2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [tenantId, orderId]
    );
    if (existing.rows[0]) {
      const token = existing.rows[0].token as string;
      return { token, url: `${env.publicSmartReportBaseUrl}/${token}` };
    }

    const token = this.generateMagicToken();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO report_magic_links (id, tenant_id, order_id, token, expires_at) VALUES ($1,$2,$3,$4,$5)`,
      [id, tenantId, orderId, token, expiresAt.toISOString()]
    );
    return { token, url: `${env.publicSmartReportBaseUrl}/${token}` };
  },

  async resolveMagicLink(token: string): Promise<{
    tenantId: string;
    orderId: string;
    patientName: string;
    orderNumber: string;
    summaryLines: Array<{ parameterName: string; value: number | null; unit: string | null; status: string }>;
    downloadUrl: string;
    verifyUrl: string;
  }> {
    ensurePg();
    const link = await db.query(
      `SELECT l.*, p.name AS patient_name, o.order_number, r.verify_token
       FROM report_magic_links l
       JOIN order_bookings o ON o.id = l.order_id
       JOIN patients p ON p.id = o.patient_id
       LEFT JOIN order_reports r ON r.order_id = l.order_id AND r.tenant_id = l.tenant_id
       WHERE l.token = $1 AND l.expires_at > NOW() AND l.use_count < l.max_uses`,
      [token]
    );
    const row = link.rows[0];
    if (!row) {
      throw new AppError("Report link expired or invalid", HTTP_STATUS.NOT_FOUND, "MAGIC_LINK_INVALID");
    }

    await db.query(`UPDATE report_magic_links SET use_count = use_count + 1 WHERE id = $1`, [row.id]);

    const entries = await db.query(
      `SELECT p.name AS parameter_name, e.value_numeric, p.unit, e.is_abnormal, e.reference_min, e.reference_max
       FROM lab_result_entries e
       JOIN lab_results lr ON lr.id = e.lab_result_id
       JOIN parameters p ON p.id = e.parameter_id
       WHERE lr.order_id = $1 AND lr.tenant_id = $2
         AND lr.status IN ('PATHOLOGIST_VERIFIED', 'PATHOLOGIST_APPROVED', 'TECHNICIAN_APPROVED')
         AND e.value_numeric IS NOT NULL
       ORDER BY p.name ASC
       LIMIT 30`,
      [row.order_id, row.tenant_id]
    );

    const summaryLines = entries.rows.map((e) => {
      const abnormal = Boolean(e.is_abnormal);
      return {
        parameterName: e.parameter_name as string,
        value: e.value_numeric == null ? null : Number(e.value_numeric),
        unit: (e.unit as string | null) ?? null,
        status: abnormal ? "abnormal" : "normal"
      };
    });

    const orderId = row.order_id as string;
    const tenantId = row.tenant_id as string;
    const verifyToken = row.verify_token as string | null;
    const verifyUrl = verifyToken
      ? `${env.publicVerifyBaseUrl}/${orderId}?t=${verifyToken}`
      : `${env.publicVerifyBaseUrl}/${orderId}`;

    let downloadUrl = verifyUrl;
    try {
      const presigned = await nablPdfEngine.createPresignedUrl(tenantId, orderId);
      downloadUrl = presigned.url;
    } catch {
      downloadUrl = `${env.publicApiBaseUrl}/api/reports/verify-public/${orderId}`;
    }

    return {
      tenantId,
      orderId,
      patientName: row.patient_name as string,
      orderNumber: row.order_number as string,
      summaryLines,
      downloadUrl,
      verifyUrl
    };
  }
};
