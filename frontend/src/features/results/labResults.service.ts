import { httpClient } from "../../services/http";

export type DeltaCheck = {
  previousValue: number;
  changePercentage: number;
  flag: "HIGH_VARIANCE";
};

export type LabResultEntry = {
  id: string;
  parameterId: string;
  parameterName: string;
  unit: string | null;
  formulaAlias: string;
  formula: string | null;
  value: number | null;
  valueText: string | null;
  isCalculated: boolean;
  isAbnormal: boolean;
  isCritical: boolean;
  flag: "H" | "L" | "CRITICAL" | null;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceRange: string;
  criticalLow: number | null;
  criticalHigh: number | null;
  deltaCheck: DeltaCheck | null;
  criticalAckNote: string | null;
};

export type PendingLabResult = {
  labResultId: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  patientGender: "MALE" | "FEMALE" | "OTHER" | null;
  patientAgeYears: number | null;
  testId: string;
  testName: string;
  departmentId: string;
  departmentName: string;
  status: string;
  technicianNote: string | null;
  entries: LabResultEntry[];
};

type ApiOk<T> = { success: true; data: T };

export const labResultsApi = {
  async pending(filters?: { department?: string; orderId?: string }): Promise<PendingLabResult[]> {
    const { data } = await httpClient.get<ApiOk<{ results: PendingLabResult[] }>>("/lab-results/pending", {
      params: filters ?? {}
    });
    return data.data.results;
  },

  async pathologistQueue(): Promise<PendingLabResult[]> {
    const { data } = await httpClient.get<ApiOk<{ results: PendingLabResult[] }>>("/lab-results/pathologist-queue");
    return data.data.results;
  },

  async saveDraft(payload: {
    labResultId: string;
    technicianNote?: string | null;
    entries: Array<{ parameterId: string; value?: number | null; valueText?: string | null; criticalAckNote?: string | null }>;
  }): Promise<PendingLabResult> {
    const { data } = await httpClient.post<ApiOk<{ result: PendingLabResult }>>("/lab-results/save-draft", payload);
    return data.data.result;
  },

  async technicianApprove(payload: {
    labResultId: string;
    technicianNote?: string | null;
    entries: Array<{ parameterId: string; value?: number | null; valueText?: string | null; criticalAckNote?: string | null }>;
  }): Promise<PendingLabResult> {
    const { data } = await httpClient.post<ApiOk<{ result: PendingLabResult }>>(
      "/lab-results/technician-approve",
      payload
    );
    return data.data.result;
  }
};
