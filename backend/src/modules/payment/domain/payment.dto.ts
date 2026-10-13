import { Invoice, Refund } from "./payment.types";

export type InvoiceResponseDto = {
  id: string;
  tenantId: string;
  patientId: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: Invoice["status"];
  createdAt: string;
};

export const toInvoiceDto = (invoice: Invoice): InvoiceResponseDto => ({
  id: invoice.id,
  tenantId: invoice.tenantId,
  patientId: invoice.patientId,
  totalAmount: Number((invoice.totalAmountMinor / 100).toFixed(2)),
  paidAmount: Number((invoice.paidAmountMinor / 100).toFixed(2)),
  dueAmount: Number((invoice.dueAmountMinor / 100).toFixed(2)),
  status: invoice.status,
  createdAt: invoice.createdAt
});

export const toMinorUnits = (amount: number): number => Math.round(amount * 100);

export type RefundResponseDto = {
  id: string;
  invoiceId: string;
  transactionId: string;
  amount: number;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
};

export const toRefundDto = (refund: Refund): RefundResponseDto => ({
  id: refund.id,
  invoiceId: refund.invoiceId,
  transactionId: refund.transactionId,
  amount: Number((refund.amountMinor / 100).toFixed(2)),
  reason: refund.reason,
  createdByUserId: refund.createdByUserId,
  createdAt: refund.createdAt
});
