import { httpClient } from "../../services/http";
import { InvoiceDto } from "./payment.service";

const idempotencyHeader = (): { headers: { "Idempotency-Key": string } } => ({
  headers: { "Idempotency-Key": crypto.randomUUID() }
});

export type RefundDto = {
  id: string;
  invoiceId: string;
  transactionId: string;
  amount: number;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
};

export const refundApi = {
  async createRefund(payload: { transactionId: string; amount: number; reason?: string }): Promise<{
    refund: RefundDto;
    invoice: InvoiceDto;
  }> {
    const { data } = await httpClient.post("/refunds", payload, idempotencyHeader());
    return data;
  },

  async listByInvoice(invoiceId: string): Promise<{ refunds: RefundDto[] }> {
    const { data } = await httpClient.get(`/refunds/${invoiceId}`);
    return data;
  }
};
