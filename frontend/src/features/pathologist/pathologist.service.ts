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
  methodology: string | null;
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

export type PathologistQueueItem = {
  labResultId: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  patientPhone: string | null;
  patientGender: "MALE" | "FEMALE" | "OTHER" | null;
  patientAgeYears: number | null;
  testId: string;
  testName: string;
  departmentId: string;
  departmentName: string;
  status: string;
  technicianNote: string | null;
  referredDoctor: string | null;
  sampleCollectedAt: string | null;
  sampleReceivedAt: string | null;
  entries: LabResultEntry[];
};

export type PathologistProfile = {
  userId: string;
  fullName: string;
  medicalLicenseNumber: string;
  digitalSignatureUrl: string | null;
};

type ApiOk<T> = { success: true; data: T };

export const pathologistApi = {
  async queue(): Promise<PathologistQueueItem[]> {
    const { data } = await httpClient.get<ApiOk<{ results: PathologistQueueItem[] }>>("/pathologist/review-queue");
    return data.data.results;
  },

  async getProfile(): Promise<PathologistProfile> {
    const { data } = await httpClient.get<ApiOk<{ profile: PathologistProfile }>>("/pathologist/profile");
    return data.data.profile;
  },

  async saveProfile(payload: {
    fullName: string;
    medicalLicenseNumber: string;
    digitalSignatureUrl?: string | null;
  }): Promise<PathologistProfile> {
    const { data } = await httpClient.put<ApiOk<{ profile: PathologistProfile }>>("/pathologist/profile", payload);
    return data.data.profile;
  },

  async verifySingle(payload: {
    labResultId: string;
    digitalSignatureUrl?: string | null;
    medicalLicenseNumber?: string | null;
    pathologistName?: string | null;
    clinicalImpression?: string | null;
  }): Promise<{
    verified: PathologistQueueItem;
    profile: PathologistProfile;
    report?: { orderId: string; reportUrl: string; verifyUrl: string };
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        verified: PathologistQueueItem;
        profile: PathologistProfile;
        report?: { orderId: string; reportUrl: string; verifyUrl: string };
      }>
    >("/pathologist/verify-single", payload);
    return data.data;
  },

  async batchVerify(payload: {
    labResultIds?: string[];
    orderIds?: string[];
    digitalSignatureUrl?: string | null;
    medicalLicenseNumber?: string | null;
    pathologistName?: string | null;
  }): Promise<{
    verified: PathologistQueueItem[];
    profile: PathologistProfile;
    reports: Array<{ orderId: string; reportUrl: string; verifyUrl: string }>;
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        verified: PathologistQueueItem[];
        profile: PathologistProfile;
        reports: Array<{ orderId: string; reportUrl: string; verifyUrl: string }>;
      }>
    >("/pathologist/verify-batch", payload);
    return data.data;
  },

  async rejectRerun(payload: { labResultId: string; note: string }): Promise<PathologistQueueItem> {
    const { data } = await httpClient.post<ApiOk<{ result: PathologistQueueItem }>>(
      "/pathologist/reject-rerun",
      payload
    );
    return data.data.result;
  },

  async requestRerun(payload: { labResultId: string; instructions: string }): Promise<PathologistQueueItem> {
    return this.rejectRerun({ labResultId: payload.labResultId, note: payload.instructions });
  },

  async distribute(orderId: string, channels?: Array<"WHATSAPP" | "SMS" | "EMAIL" | "WEBHOOK">): Promise<{
    distributions: Array<{
      channel: string;
      status: string;
      destination: string;
      mock?: boolean;
      reason?: string;
    }>;
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        distributions: Array<{
          channel: string;
          status: string;
          destination: string;
          mock?: boolean;
          reason?: string;
        }>;
      }>
    >(`/api/reports/distribute/${orderId}`, { channels });
    return data.data;
  },

  downloadUrl(orderId: string): string {
    return `/api/reports/download/${orderId}`;
  },

  async downloadPdfBlob(orderId: string): Promise<Blob> {
    const { data } = await httpClient.get(this.downloadUrl(orderId), { responseType: "blob" });
    return data as Blob;
  }
};
