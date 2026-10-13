import { DbClient } from "../../../database/postgres";
import { PaymentMethod, PaymentTransaction, Refund } from "../domain/payment.types";
import { ledgerRepository } from "../infrastructure/ledger.repository";

const REVENUE_ACCOUNT = "REVENUE";

export const debitAccountForPaymentMethod = (method: PaymentMethod): string => {
  switch (method) {
    case "CASH":
      return "CASH";
    case "UPI":
    case "CARD":
      return "BANK";
    case "ONLINE":
      return "GATEWAY_CLEARING";
  }
};

export const ledgerService = {
  async createLedgerEntriesForSuccessfulPayment(tx: PaymentTransaction, client: DbClient): Promise<void> {
    await ledgerRepository.insertDoubleEntry(
      {
        tenantId: tx.tenantId,
        invoiceId: tx.invoiceId,
        transactionId: tx.id,
        amountMinor: tx.amountMinor,
        debitAccountCode: debitAccountForPaymentMethod(tx.method),
        creditAccountCode: REVENUE_ACCOUNT
      },
      client
    );
  },

  /** Reverses the original capture: DEBIT revenue, CREDIT cash/bank/gateway clearing. */
  async createLedgerReversalForRefund(refund: Refund, paymentMethod: PaymentMethod, client: DbClient): Promise<void> {
    await ledgerRepository.insertRefundReversalDoubleEntry(
      {
        tenantId: refund.tenantId,
        invoiceId: refund.invoiceId,
        transactionId: refund.transactionId,
        refundId: refund.id,
        amountMinor: refund.amountMinor,
        debitAccountCode: REVENUE_ACCOUNT,
        creditAccountCode: debitAccountForPaymentMethod(paymentMethod)
      },
      client
    );
  }
};