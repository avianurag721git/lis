import axios from "axios";
import { env } from "../../utils/env";

export type KioskCatalog = {
  tests: Array<{ id: string; name: string; code: string | null; priceMinor: number }>;
  packages: Array<{ id: string; name: string; code: string | null; priceMinor: number }>;
};

export type QueueToken = {
  id: string;
  tokenLabel: string;
  queueNumber: number;
  amountMinor: number;
  paymentStatus: string;
  orderId: string;
};

const tenantHeader = (): Record<string, string> => ({
  "x-tenant-id": new URLSearchParams(window.location.search).get("tenant") ?? "demo"
});

export const kioskApi = {
  async catalog(): Promise<KioskCatalog> {
    const { data } = await axios.get<{ success: boolean; data: KioskCatalog }>(`${env.apiUrl}/api/kiosk/catalog`, {
      headers: tenantHeader()
    });
    return data.data;
  },

  async book(input: {
    mobile: string;
    patientName?: string;
    testIds: string[];
    paymentReference?: string;
  }): Promise<{ order: { orderNumber: string; netAmountMinor: number }; token: QueueToken; upiUri: string }> {
    const { data } = await axios.post(`${env.apiUrl}/api/kiosk/book`, input, { headers: tenantHeader() });
    return data.data;
  },

  async confirmPayment(tokenId: string, transactionReference: string): Promise<QueueToken> {
    const { data } = await axios.post(
      `${env.apiUrl}/api/kiosk/confirm-payment`,
      { tokenId, transactionReference },
      { headers: tenantHeader() }
    );
    return data.data.token;
  }
};
