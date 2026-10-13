import { httpClient } from "../../services/http";

export type LongitudinalDataPoint = {
  date: string;
  value: number | null;
  valueText: string | null;
  orderId: string;
  orderNumber: string;
  testId: string;
  testName: string;
  referenceMin: number | null;
  referenceMax: number | null;
  isAbnormal: boolean;
  flag: string | null;
};

export type LongitudinalParameterSeries = {
  parameterId: string;
  parameterName: string;
  unit: string | null;
  referenceMin: number | null;
  referenceMax: number | null;
  dataPoints: LongitudinalDataPoint[];
};

export type LongitudinalHistory = {
  patient: {
    id: string;
    name: string;
    gender: string | null;
    ageYears: number | null;
  };
  parameters: LongitudinalParameterSeries[];
};

export const longitudinalApi = {
  async getHistory(patientId: string): Promise<LongitudinalHistory> {
    const { data } = await httpClient.get<{ success: boolean; data: LongitudinalHistory }>(
      `/api/patients/${patientId}/longitudinal-history`
    );
    return data.data;
  }
};
