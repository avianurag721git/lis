import { db } from "../../database/postgres";
import { ActivityRow, PaymentByDateRow } from "./analytics.types";

type Range = { fromIso: string; toIso: string };

export const analyticsRepository = {
  async totalRevenueMinor(tenantId: string, range: Range): Promise<number> {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
       FROM payment_transactions
       WHERE tenant_id = $1
         AND status = 'SUCCESS'
         AND created_at >= $2::timestamptz
         AND created_at <= $3::timestamptz`,
      [tenantId, range.fromIso, range.toIso]
    );
    return Number(result.rows[0]?.total ?? 0);
  },

  async paymentsByDate(tenantId: string, range: Range): Promise<PaymentByDateRow[]> {
    const result = await db.query(
      `SELECT
         (created_at AT TIME ZONE 'UTC')::date::text AS day,
         COUNT(*)::int AS cnt,
         COALESCE(SUM(amount_minor), 0)::bigint AS volume
       FROM payment_transactions
       WHERE tenant_id = $1
         AND status = 'SUCCESS'
         AND created_at >= $2::timestamptz
         AND created_at <= $3::timestamptz
       GROUP BY 1
       ORDER BY 1 ASC`,
      [tenantId, range.fromIso, range.toIso]
    );
    return result.rows.map((row: { day: string; cnt: number; volume: string }) => ({
      date: row.day,
      paymentCount: row.cnt,
      amountMinor: Number(row.volume)
    }));
  },

  async distinctPatientCount(tenantId: string): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(DISTINCT patient_id)::int AS c FROM invoices WHERE tenant_id = $1`,
      [tenantId]
    );
    return Number(result.rows[0]?.c ?? 0);
  },

  async refundTotalMinor(tenantId: string, range: Range): Promise<number> {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
       FROM refunds
       WHERE tenant_id = $1
         AND created_at >= $2::timestamptz
         AND created_at <= $3::timestamptz`,
      [tenantId, range.fromIso, range.toIso]
    );
    return Number(result.rows[0]?.total ?? 0);
  },

  async recentActivity(tenantId: string, limit: number): Promise<ActivityRow[]> {
    const result = await db.query(
      `SELECT * FROM (
         SELECT
           'PAYMENT'::text AS kind,
           pt.id::text AS id,
           pt.amount_minor,
           pt.created_at,
           pt.invoice_id::text AS invoice_id,
           pt.status::text AS status,
           NULL::text AS related_id
         FROM payment_transactions pt
         WHERE pt.tenant_id = $1
         UNION ALL
         SELECT
           'REFUND'::text,
           r.id::text,
           r.amount_minor,
           r.created_at,
           r.invoice_id::text,
           'REFUND'::text,
           r.transaction_id::text
         FROM refunds r
         WHERE r.tenant_id = $1
       ) u
       ORDER BY u.created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows.map(
      (row: {
        kind: string;
        id: string;
        amount_minor: string;
        created_at: Date;
        invoice_id: string;
        status: string;
        related_id: string | null;
      }) => ({
        kind: row.kind === "REFUND" ? "REFUND" : "PAYMENT",
        id: row.id,
        amountMinor: Number(row.amount_minor),
        createdAt: row.created_at.toISOString(),
        invoiceId: row.invoice_id,
        status: row.status,
        relatedId: row.related_id
      })
    );
  }
};
