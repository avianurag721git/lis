import { httpClient } from "../../services/http";

const idempotencyHeader = (): { headers: { "Idempotency-Key": string } } => ({
  headers: { "Idempotency-Key": crypto.randomUUID() }
});

export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type ManualPaymentMethod = "CASH" | "UPI" | "CARD";

export type InvoiceDto = {
  id: string;
  tenantId: string;
  patientId: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: InvoiceStatus;
  createdAt: string;
};

export type PaymentTransactionDto = {
  id: string;
  invoiceId: string;
  amount: number;
  method: ManualPaymentMethod | "ONLINE";
  status: "SUCCESS" | "FAILED" | "PENDING";
  transactionReference: string | null;
  gatewayOrderId?: string | null;
  createdAt: string;
};

export const paymentApi = {
  async createInvoice(payload: { patientId: string; totalAmount: number }): Promise<{ invoice: InvoiceDto }> {
    const { data } = await httpClient.post("/invoices", payload, idempotencyHeader());
    return data;
  },
  async getInvoice(invoiceId: string): Promise<{ invoice: InvoiceDto }> {
    const { data } = await httpClient.get(`/invoices/${invoiceId}`);
    return data;
  },
  async getPaymentHistory(invoiceId: string): Promise<{ transactions: PaymentTransactionDto[] }> {
    const { data } = await httpClient.get(`/invoices/${invoiceId}/payments`);
    return data;
  },
  async addPayment(payload: {
    invoiceId: string;
    amount: number;
    method: ManualPaymentMethod;
    transactionReference?: string;
  }): Promise<{ invoice: InvoiceDto; transaction: PaymentTransactionDto }> {
    const { data } = await httpClient.post("/payments", payload, idempotencyHeader());
    return data;
  },
  async createPaymentOrder(payload: {
    invoiceId: string;
    amount: number;
  }): Promise<{ transactionId: string; gatewayOrderId: string; clientSecret: string }> {
    const { data } = await httpClient.post("/payments/order", payload, idempotencyHeader());
    return data;
  },
  async verify(payload: { gatewayOrderId: string; paymentIntentId: string }): Promise<{ status: string; invoice: InvoiceDto }> {
    const { data } = await httpClient.post("/payments/verify", payload, idempotencyHeader());
    return data;
  }
};
