import { randomUUID } from "crypto";
import { AppError } from "../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../common/constants/httpStatus";
import { DbClient, db } from "../../../database/postgres";
import { PaymentMethod, PaymentTransaction, TransactionStatus } from "../domain/payment.types";

export type CreatePaymentTransactionInput = {
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  method: PaymentMethod;
  status: TransactionStatus;
  transactionReference?: string | null;
  gatewayOrderId?: string | null;
};

const mapMethodFromDb = (raw: string): PaymentMethod => {
  if (raw === "ONLINE_GATEWAY") return "ONLINE";
  return raw as PaymentMethod;
};

const mapTxRow = (row: {
  id: string;
  tenant_id: string;
  invoice_id: string;
  amount_minor: string;
  method: string;
  status: TransactionStatus;
  transaction_reference: string | null;
  gateway_order_id: string | null;
  created_at: Date;
}): PaymentTransaction => ({
  id: row.id,
  tenantId: row.tenant_id,
  invoiceId: row.invoice_id,
  amountMinor: Number(row.amount_minor),
  method: mapMethodFromDb(row.method),
  status: row.status,
  transactionReference: row.transaction_reference,
  gatewayOrderId: row.gateway_order_id,
  createdAt: row.created_at.toISOString()
});

export const paymentRepository = {
  async acquireIdempotencyLock(client: DbClient, lockScope: string): Promise<void> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext('idempotency'))`, [lockScope]);
  },

  async getIdempotencyResponse<T>(tenantId: string, operation: string, idempotencyKey: string, client: DbClient): Promise<T | null> {
    const result = await client.query(
      `SELECT response_json FROM idempotency_keys WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3`,
      [tenantId, operation, idempotencyKey]
    );
    return (result.rows[0]?.response_json as T) ?? null;
  },

  async saveIdempotencyResponse(
    tenantId: string,
    operation: string,
    idempotencyKey: string,
    responseJson: unknown,
    client: DbClient
  ): Promise<void> {
    await client.query(
      `INSERT INTO idempotency_keys (id, tenant_id, operation, idempotency_key, response_json)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING`,
      [randomUUID(), tenantId, operation, idempotencyKey, JSON.stringify(responseJson)]
    );
  },

  async insertTransaction(input: CreatePaymentTransactionInput, client: DbClient): Promise<PaymentTransaction> {
    const tx: PaymentTransaction = {
      id: randomUUID(),
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      method: input.method,
      status: input.status,
      transactionReference: input.transactionReference ?? null,
      gatewayOrderId: input.gatewayOrderId ?? null,
      createdAt: new Date().toISOString()
    };
    await client.query(
      `INSERT INTO payment_transactions
       (id, tenant_id, invoice_id, amount_minor, method, status, transaction_reference, gateway_order_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tx.id,
        tx.tenantId,
        tx.invoiceId,
        tx.amountMinor,
        tx.method,
        tx.status,
        tx.transactionReference,
        tx.gatewayOrderId,
        tx.createdAt
      ]
    );
    return tx;
  },

  async updateStatusAndReference(tx: PaymentTransaction, client?: DbClient): Promise<void> {
    const q = client ?? db;
    await q.query(
      `UPDATE payment_transactions
       SET status = $1, transaction_reference = $2
       WHERE id = $3 AND tenant_id = $4`,
      [tx.status, tx.transactionReference, tx.id, tx.tenantId]
    );
  },

  async findById(tenantId: string, transactionId: string, client?: DbClient): Promise<PaymentTransaction> {
    const q = client ?? db;
    const result = await q.query(`SELECT * FROM payment_transactions WHERE id = $1 AND tenant_id = $2`, [
      transactionId,
      tenantId
    ]);
    if (!result.rows[0]) {
      throw new AppError("Transaction not found", HTTP_STATUS.NOT_FOUND, "TX_NOT_FOUND");
    }
    return mapTxRow(result.rows[0]);
  },

  async lockByIdForUpdate(tenantId: string, transactionId: string, client: DbClient): Promise<PaymentTransaction | null> {
    const result = await client.query(`SELECT * FROM payment_transactions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [
      transactionId,
      tenantId
    ]);
    return result.rows[0] ? mapTxRow(result.rows[0]) : null;
  },

  async findByGatewayOrderId(gatewayOrderId: string, client?: DbClient): Promise<PaymentTransaction | null> {
    const q = client ?? db;
    const result = await q.query(`SELECT * FROM payment_transactions WHERE gateway_order_id = $1`, [gatewayOrderId]);
    return result.rows[0] ? mapTxRow(result.rows[0]) : null;
  },

  async lockByGatewayOrderIdForUpdate(gatewayOrderId: string, client: DbClient): Promise<PaymentTransaction | null> {
    const result = await client.query(`SELECT * FROM payment_transactions WHERE gateway_order_id = $1 FOR UPDATE`, [
      gatewayOrderId
    ]);
    return result.rows[0] ? mapTxRow(result.rows[0]) : null;
  },

  async existsByTransactionReference(reference: string, client?: DbClient): Promise<boolean> {
    const q = client ?? db;
    const result = await q.query(`SELECT EXISTS (SELECT 1 FROM payment_transactions WHERE transaction_reference = $1)`, [
      reference
    ]);
    return Boolean(result.rows[0]?.exists);
  },

  async listByInvoice(tenantId: string, invoiceId: string, client?: DbClient): Promise<PaymentTransaction[]> {
    const q = client ?? db;
    const result = await q.query(
      `SELECT * FROM payment_transactions WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY created_at DESC`,
      [tenantId, invoiceId]
    );
    return result.rows.map(mapTxRow);
  },

  async listPendingOnlineOlderThan(minutes: number): Promise<PaymentTransaction[]> {
    const result = await db.query(
      `SELECT *
       FROM payment_transactions
       WHERE method IN ('ONLINE', 'ONLINE_GATEWAY')
         AND status = 'PENDING'
         AND created_at < NOW() - ($1::text || ' minutes')::interval`,
      [minutes]
    );
    return result.rows.map(mapTxRow);
  }
};
