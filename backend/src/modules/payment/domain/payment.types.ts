export const INVOICE_STATUS = ["UNPAID", "PARTIALLY_PAID", "PAID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const PAYMENT_METHOD = ["CASH", "UPI", "CARD", "ONLINE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

export const TRANSACTION_STATUS = ["SUCCESS", "FAILED", "PENDING"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUS)[number];

export type Invoice = {
  id: string;
  tenantId: string;
  patientId: string;
  totalAmountMinor: number;
  paidAmountMinor: number;
  dueAmountMinor: number;
  status: InvoiceStatus;
  createdAt: string;
};

export type PaymentTransaction = {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  method: PaymentMethod;
  status: TransactionStatus;
  transactionReference: string | null;
  gatewayOrderId: string | null;
  createdAt: string;
};

export type Refund = {
  id: string;
  tenantId: string;
  invoiceId: string;
  transactionId: string;
  amountMinor: number;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
};
