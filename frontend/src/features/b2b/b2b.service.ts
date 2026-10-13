import { httpClient } from "../../services/http";

export type B2BFranchisee = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  walletBalanceMinor: number;
  creditLimitMinor: number;
  isActive: boolean;
};

export type B2BPriceRow = {
  testId?: string;
  packageId?: string;
  name: string;
  retailPriceMinor: number;
  wholesalePriceMinor: number;
};

export type B2BWalletTx = {
  id: string;
  type: string;
  amountMinor: number;
  balanceAfterMinor: number;
  orderId: string | null;
  gateway: string | null;
  note: string | null;
  createdAt: string;
};

export type B2BLedger = {
  franchisee: B2BFranchisee;
  transactions: B2BWalletTx[];
  openingBalanceMinor: number;
  closingBalanceMinor: number;
};

type ApiOk<T> = { success: true; data: T };

export const b2bApi = {
  async list(): Promise<B2BFranchisee[]> {
    const { data } = await httpClient.get<ApiOk<{ franchisees: B2BFranchisee[] }>>("/b2b/franchisees");
    return data.data.franchisees;
  },

  async upsert(payload: {
    code: string;
    name: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    creditLimitMinor?: number;
  }): Promise<B2BFranchisee> {
    const { data } = await httpClient.post<ApiOk<{ franchisee: B2BFranchisee }>>("/b2b/franchisees", payload);
    return data.data.franchisee;
  },

  async rateCard(franchiseeId: string): Promise<{ tests: B2BPriceRow[]; packages: B2BPriceRow[] }> {
    const { data } = await httpClient.get<ApiOk<{ rateCard: { tests: B2BPriceRow[]; packages: B2BPriceRow[] } }>>(
      `/b2b/franchisees/${franchiseeId}/rate-card`
    );
    return data.data.rateCard;
  },

  async setTestPrice(franchiseeId: string, testId: string, priceMinor: number): Promise<void> {
    await httpClient.put(`/b2b/franchisees/${franchiseeId}/rate-card`, { tests: [{ testId, priceMinor }] });
  },

  async wallet(
    franchiseeId: string,
    opts?: { from?: string; to?: string }
  ): Promise<{ franchisee: B2BFranchisee; transactions: B2BWalletTx[] }> {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    const qs = params.toString();
    const { data } = await httpClient.get<ApiOk<{ franchisee: B2BFranchisee; transactions: B2BWalletTx[] }>>(
      `/b2b/franchisees/${franchiseeId}/wallet${qs ? `?${qs}` : ""}`
    );
    return data.data;
  },

  async ledger(franchiseeId: string, opts?: { from?: string; to?: string }): Promise<B2BLedger> {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    const qs = params.toString();
    const { data } = await httpClient.get<ApiOk<{ ledger: B2BLedger }>>(
      `/b2b/ledger/${franchiseeId}${qs ? `?${qs}` : ""}`
    );
    return data.data.ledger;
  },

  async exportLedger(
    franchiseeId: string,
    opts: { from?: string; to?: string; format: "csv" | "pdf" }
  ): Promise<Blob> {
    const params = new URLSearchParams({ format: opts.format });
    if (opts.from) params.set("from", opts.from);
    if (opts.to) params.set("to", opts.to);
    const { data } = await httpClient.get(`/b2b/ledger/${franchiseeId}?${params.toString()}`, {
      responseType: "blob"
    });
    return data as Blob;
  },

  async recharge(
    franchiseeId: string,
    amountMinor: number,
    gateway: "STRIPE" | "RAZORPAY" = "STRIPE"
  ): Promise<{ gateway: string; clientSecret?: string; paymentIntentId?: string; amountMinor: number; mock?: boolean }> {
    const { data } = await httpClient.post<
      ApiOk<{
        recharge: {
          gateway: string;
          clientSecret?: string;
          paymentIntentId?: string;
          amountMinor: number;
          mock?: boolean;
        };
      }>
    >(`/b2b/wallet/recharge`, { franchiseeId, amountMinor, gateway });
    return data.data.recharge;
  },

  async confirmRecharge(
    franchiseeId: string,
    payload: { amountMinor: number; gateway: "STRIPE" | "RAZORPAY"; gatewayRef: string }
  ): Promise<B2BFranchisee> {
    const { data } = await httpClient.post<ApiOk<{ franchisee: B2BFranchisee }>>(
      `/b2b/franchisees/${franchiseeId}/wallet/confirm`,
      payload
    );
    return data.data.franchisee;
  },

  async bulkOrders(franchiseeId: string, csv: string): Promise<{ created: number; errors: string[]; orderIds: string[] }> {
    const { data } = await httpClient.post<ApiOk<{ created: number; errors: string[]; orderIds: string[] }>>(
      `/b2b/orders/bulk-upload`,
      { franchiseeId, csv }
    );
    return data.data;
  },

  async createOrder(payload: {
    franchiseeId: string;
    patient?: { name?: string; phone?: string };
    items: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string; quantity?: number }>;
  }) {
    const { data } = await httpClient.post(`/b2b/orders/create`, payload);
    return data.data;
  }
};
