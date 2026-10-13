import { randomUUID } from "crypto";
import { DbClient, db } from "../../../database/postgres";
import { Refund } from "../domain/payment.types";

type InsertRefundInput = {
  tenantId: string;
  invoiceId: string;
  transactionId: string;
  amountMinor: number;
  reason: string | null;
  createdByUserId: string;
};

const mapRefundRow = (row: {
  id: string;
  tenant_id: string;
  invoice_id: string;
  transaction_id: string;
  amount_minor: string;
  reason: string | null;
  created_by_user_id: string;
  created_at: Date;
}): Refund => ({
  id: row.id,
  tenantId: row.tenant_id,
  invoiceId: row.invoice_id,
  transactionId: row.transaction_id,
  amountMinor: Number(row.amount_minor),
  reason: row.reason,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at.toISOString()
});

export const refundRepository = {
  async sumRefundedForTransaction(tenantId: string, transactionId: string, client: DbClient): Promise<number> {
    const result = await client.query(
      `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total FROM refunds WHERE tenant_id = $1 AND transaction_id = $2`,
      [tenantId, transactionId]
    );
    return Number(result.rows[0]?.total ?? 0);
  },

  async insert(input: InsertRefundInput, client: DbClient): Promise<Refund> {
    const refund: Refund = {
      id: randomUUID(),
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      transactionId: input.transactionId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString()
    };
    await client.query(
      `INSERT INTO refunds (id, tenant_id, invoice_id, transaction_id, amount_minor, reason, created_by_user_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        refund.id,
        refund.tenantId,
        refund.invoiceId,
        refund.transactionId,
        refund.amountMinor,
        refund.reason,
        refund.createdByUserId,
        refund.createdAt
      ]
    );
    return refund;
  },

  async listByInvoiceId(tenantId: string, invoiceId: string, client?: DbClient): Promise<Refund[]> {
    const q = client ?? db;
    const result = await q.query(
      `SELECT * FROM refunds WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY created_at DESC`,
      [tenantId, invoiceId]
    );
    return result.rows.map(mapRefundRow);
  }
};
