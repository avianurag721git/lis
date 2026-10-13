import { httpClient } from "../../services/http";

export type OperationsJobResult = {
  message: string;
  reportsGenerated?: number;
  paymentsProcessed?: number;
  mode?: "live" | "mock";
  detail?: string;
};

export type OperationsStatus = {
  lastReportRun: string | null;
  lastPaymentRun: string | null;
  pendingReports?: number;
  pendingPayments?: number;
  stripeConfigured?: boolean;
};

export const operationsApi = {
  async triggerReportGeneration(): Promise<OperationsJobResult> {
    const { data } = await httpClient.post("/operations/reports/generate");
    return data;
  },

  async triggerPaymentProcess(): Promise<OperationsJobResult> {
    const { data } = await httpClient.post("/operations/payments/process");
    return data;
  },

  async getStatus(): Promise<OperationsStatus> {
    const { data } = await httpClient.get("/operations/status");
    return data;
  }
};
