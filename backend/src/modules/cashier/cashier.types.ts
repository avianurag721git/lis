export type CashierPaymentMethod = "CASH" | "UPI" | "CARD" | "TPA" | "ONLINE";

export type CashierInvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export type CashierInvoice = {
  id: string;
  orderId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  patientGstin: string | null;
  labGstin: string;
  subtotalMinor: number;
  discountMinor: number;
  discountPercent: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxRatePercent: number;
  netAmountMinor: number;
  paidAmountMinor: number;
  dueAmountMinor: number;
  status: CashierInvoiceStatus;
  discountAuthorizedBy: string | null;
  discountAuthorizerRole: string | null;
  filePath: string | null;
  createdAt: string;
};

export type CashierPayment = {
  id: string;
  invoiceId: string;
  orderId: string;
  amountMinor: number;
  method: CashierPaymentMethod;
  tpaInsurer: string | null;
  tpaClaimId: string | null;
  transactionReference: string | null;
  status: string;
  createdAt: string;
};

export type OrderBillLine = {
  id: string;
  itemType: "TEST" | "PACKAGE";
  testId: string | null;
  packageId: string | null;
  name: string;
  priceMinor: number;
  quantity: number;
};

export type OrderBill = {
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  referredDoctor: string | null;
  referralDoctorId: string | null;
  referralDoctorCode: string | null;
  referralCommissionPercentage: number;
  collectionType: string;
  franchiseeId: string | null;
  paymentStatus: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  taxRatePercent: number;
  netAmountMinor: number;
  items: OrderBillLine[];
  invoice: CashierInvoice | null;
  /** False when any sample has left PENDING_COLLECTION (phlebotomy/lab started). */
  canRemoveItems: boolean;
  removeItemsBlockedReason: string | null;
};

export type AdjustOrderItemsInput = {
  orderId: string;
  addItems?: Array<{
    itemType: "TEST" | "PACKAGE";
    testId?: string;
    packageId?: string;
    quantity?: number;
  }>;
  removeItemIds?: string[];
  discountMinor?: number;
  taxRatePercent?: number;
  referredDoctor?: string | null;
  referralDoctorId?: string | null;
};

export type CollectPaymentInput = {
  orderId: string;
  amountMinor: number;
  method: CashierPaymentMethod;
  tpaInsurer?: string | null;
  tpaClaimId?: string | null;
  transactionReference?: string | null;
};

export type InvoiceListItem = {
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  status: string;
  paymentStatus: string;
  subtotalMinor: number;
  discountMinor: number;
  taxRatePercent: number;
  netAmountMinor: number;
  paidAmountMinor: number;
  dueAmountMinor: number;
  createdAt: string;
};
