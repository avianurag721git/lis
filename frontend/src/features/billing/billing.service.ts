import { httpClient } from "../../services/http";

export type CashierPaymentMethod = "CASH" | "UPI" | "CARD" | "TPA" | "ONLINE";

export type OrderBillLine = {
  id: string;
  itemType: "TEST" | "PACKAGE";
  testId: string | null;
  packageId: string | null;
  name: string;
  priceMinor: number;
  quantity: number;
};

export type CashierInvoice = {
  id: string;
  orderId: string;
  invoiceNumber: string;
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
  status: string;
  discountStatus?: string;
  requestedDiscountMinor?: number;
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
  canRemoveItems?: boolean;
  removeItemsBlockedReason?: string | null;
};

export type CashierPayment = {
  id: string;
  amountMinor: number;
  method: CashierPaymentMethod;
  tpaInsurer: string | null;
  tpaClaimId: string | null;
  transactionReference: string | null;
  createdAt: string;
};

export type TenderLine = {
  amountRupees: number;
  method: CashierPaymentMethod;
  tpaInsurer?: string;
  tpaClaimId?: string;
  transactionReference?: string;
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

type ApiOk<T> = { success: true; data: T };

export const billingApi = {
  async queue(): Promise<OrderBill[]> {
    const { data } = await httpClient.get<ApiOk<{ orders: OrderBill[] }>>("/cashier/queue");
    return data.data.orders;
  },

  async listInvoices(params?: { q?: string; status?: string }): Promise<InvoiceListItem[]> {
    const { data } = await httpClient.get<ApiOk<{ invoices: InvoiceListItem[] }>>("/cashier/invoices", {
      params: {
        ...(params?.q ? { q: params.q } : {}),
        ...(params?.status ? { status: params.status } : {})
      }
    });
    return data.data.invoices;
  },

  async getBill(orderId: string): Promise<OrderBill> {
    const { data } = await httpClient.get<ApiOk<{ bill: OrderBill }>>(`/cashier/orders/${orderId}`);
    return data.data.bill;
  },

  async adjust(
    orderId: string,
    payload: {
      addItems?: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string; quantity?: number }>;
      removeItemIds?: string[];
      discountMinor?: number;
      taxRatePercent?: number;
      referredDoctor?: string | null;
      referralDoctorId?: string | null;
    }
  ): Promise<OrderBill> {
    const { data } = await httpClient.patch<ApiOk<{ bill: OrderBill }>>(`/cashier/orders/${orderId}`, payload);
    return data.data.bill;
  },

  async createInvoice(orderId: string, body?: { patientGstin?: string | null; interstate?: boolean }): Promise<{
    bill: OrderBill;
    invoice: CashierInvoice;
  }> {
    const { data } = await httpClient.post<ApiOk<{ bill: OrderBill; invoice: CashierInvoice }>>(
      `/cashier/orders/${orderId}/invoice`,
      body ?? {}
    );
    return data.data;
  },

  /** Full billing create-invoice: GST, discount matrix, multi-tender, PENDING_APPROVAL. */
  async createBillingInvoice(payload: {
    orderId?: string;
    patientId?: string;
    patient?: { name?: string; phone?: string; mobile?: string; gender?: "MALE" | "FEMALE" | "OTHER" | null; ageYears?: number | null };
    items?: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string; quantity?: number }>;
    discountMinor?: number;
    taxRatePercent?: number;
    taxExempt?: boolean;
    referredDoctor?: string | null;
    referralDoctorId?: string | null;
    payments?: Array<{
      amountMinor: number;
      method: CashierPaymentMethod;
      tpaInsurer?: string | null;
      tpaClaimId?: string | null;
      transactionReference?: string | null;
    }>;
  }): Promise<{
    bill: OrderBill;
    invoice: CashierInvoice;
    payments: CashierPayment[];
    discountStatus: "APPROVED" | "PENDING_APPROVAL";
    message: string;
    alreadySettled?: boolean;
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        bill: OrderBill;
        invoice: CashierInvoice;
        payments: CashierPayment[];
        discountStatus: "APPROVED" | "PENDING_APPROVAL";
        message: string;
        alreadySettled?: boolean;
      }>
    >("/billing/create-invoice", payload, { timeout: 60_000 });
    return data.data;
  },

  async approveDiscount(orderId: string): Promise<{ bill: OrderBill; discountStatus: string }> {
    const { data } = await httpClient.post<ApiOk<{ bill: OrderBill; discountStatus: string }>>(
      `/billing/orders/${orderId}/approve-discount`
    );
    return data.data;
  },

  async pay(
    orderId: string,
    payload: {
      amountMinor: number;
      method: CashierPaymentMethod;
      tpaInsurer?: string | null;
      tpaClaimId?: string | null;
      transactionReference?: string | null;
    }
  ): Promise<{ bill: OrderBill; payment: CashierPayment; invoice: CashierInvoice }> {
    const { data } = await httpClient.post<
      ApiOk<{ bill: OrderBill; payment: CashierPayment; invoice: CashierInvoice }>
    >(`/cashier/orders/${orderId}/pay`, payload);
    return data.data;
  },

  async payments(orderId: string): Promise<CashierPayment[]> {
    const { data } = await httpClient.get<ApiOk<{ payments: CashierPayment[] }>>(
      `/cashier/orders/${orderId}/payments`
    );
    return data.data.payments;
  },

  async downloadInvoicePdf(orderId: string): Promise<Blob> {
    const { data } = await httpClient.get(`/cashier/orders/${orderId}/invoice.pdf`, { responseType: "blob" });
    return data as Blob;
  }
};
