import { randomUUID } from "crypto";
import { DbClient } from "../../../database/postgres";

export type LedgerDoubleEntryInput = {
  tenantId: string;
  invoiceId: string;
  transactionId: string;
  amountMinor: number;
  debitAccountCode: string;
  creditAccountCode: string;
};

export type LedgerRefundReversalInput = {
  tenantId: string;
  invoiceId: string;
  transactionId: string;
  refundId: string;
  amountMinor: number;
  debitAccountCode: string;
  creditAccountCode: string;
};

export const ledgerRepository = {
  async insertDoubleEntry(input: LedgerDoubleEntryInput, client: DbClient): Promise<void> {
    try {
      await client.query(
        `INSERT INTO ledger_entries
        (id, tenant_id, invoice_id, transaction_id, refund_id, account_code, direction, amount_minor)
        VALUES
        ($1,$2,$3,$4,NULL,$5,$6,$7),
        ($8,$2,$3,$4,NULL,$9,$10,$7)`,
        [
          randomUUID(),
          input.tenantId,
          input.invoiceId,
          input.transactionId,
          input.debitAccountCode,
          "DEBIT",
          input.amountMinor,
          randomUUID(),
          input.creditAccountCode,
          "CREDIT"
        ]
      );
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
      if (code === "23505") return;
      throw err;
    }
  },

  async insertRefundReversalDoubleEntry(input: LedgerRefundReversalInput, client: DbClient): Promise<void> {
    try {
      await client.query(
        `INSERT INTO ledger_entries
        (id, tenant_id, invoice_id, transaction_id, refund_id, account_code, direction, amount_minor)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8),
        ($9,$2,$3,$4,$5,$10,$11,$8)`,
        [
          randomUUID(),
          input.tenantId,
          input.invoiceId,
          input.transactionId,
          input.refundId,
          input.debitAccountCode,
          "DEBIT",
          input.amountMinor,
          randomUUID(),
          input.creditAccountCode,
          "CREDIT"
        ]
      );
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
      if (code === "23505") return;
      throw err;
    }
  }
};