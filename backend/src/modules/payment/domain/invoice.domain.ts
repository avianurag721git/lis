import { AppError } from "../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../common/constants/httpStatus";
import { Invoice } from "./payment.types";

export const computeInvoiceStatus = (invoice: Invoice): Invoice["status"] => {
  if (invoice.paidAmountMinor <= 0) return "UNPAID";
  if (invoice.paidAmountMinor >= invoice.totalAmountMinor) return "PAID";
  return "PARTIALLY_PAID";
};

export const applyPaymentToInvoice = (invoice: Invoice, amountMinor: number): Invoice => {
  if (amountMinor <= 0) {
    throw new AppError("Amount must be positive", HTTP_STATUS.BAD_REQUEST, "INVALID_AMOUNT");
  }
  if (invoice.paidAmountMinor + amountMinor > invoice.totalAmountMinor) {
    throw new AppError("Payment exceeds due amount", HTTP_STATUS.BAD_REQUEST, "OVERPAYMENT_NOT_ALLOWED");
  }
  invoice.paidAmountMinor += amountMinor;
  invoice.dueAmountMinor = invoice.totalAmountMinor - invoice.paidAmountMinor;
  invoice.status = computeInvoiceStatus(invoice);
  return invoice;
};

export const applyRefundToInvoice = (invoice: Invoice, amountMinor: number): Invoice => {
  if (amountMinor <= 0) {
    throw new AppError("Refund amount must be positive", HTTP_STATUS.BAD_REQUEST, "INVALID_AMOUNT");
  }
  if (invoice.paidAmountMinor < amountMinor) {
    throw new AppError("Refund exceeds paid amount on invoice", HTTP_STATUS.BAD_REQUEST, "REFUND_EXCEEDS_INVOICE_PAID");
  }
  invoice.paidAmountMinor -= amountMinor;
  invoice.dueAmountMinor = invoice.totalAmountMinor - invoice.paidAmountMinor;
  invoice.status = computeInvoiceStatus(invoice);
  return invoice;
};
