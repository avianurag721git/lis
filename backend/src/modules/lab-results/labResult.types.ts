export type LabResultStatus =
  | "PENDING"
  | "PROCESSING"
  | "DRAFT"
  | "TECHNICIAN_APPROVED"
  | "PATHOLOGIST_APPROVED"
  | "PATHOLOGIST_VERIFIED"
  | "RERUN_REQUESTED"
  | "REJECTED";

export type DeltaCheck = {
  previousValue: number;
  changePercentage: number;
  flag: "HIGH_VARIANCE";
};

export type LabResultEntryDto = {
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

export type PendingLabResultRow = {
  labResultId: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  patientPhone: string | null;
  patientGender: "MALE" | "FEMALE" | "OTHER" | null;
  patientAgeYears: number | null;
  patientDob: string | null;
  testId: string;
  testName: string;
  testSampleType: string | null;
  departmentId: string;
  departmentName: string;
  status: LabResultStatus;
  technicianNote: string | null;
  referredDoctor: string | null;
  sampleCollectedAt: string | null;
  sampleReceivedAt: string | null;
  sampleType: string | null;
  sampleQuality: string | null;
  verifiedAt: string | null;
  pathologistName: string | null;
  pathologistLicense: string | null;
  pathologistSignatureUrl: string | null;
  approvedByUserId: string | null;
  entries: LabResultEntryDto[];
};

export type SaveDraftInput = {
  labResultId: string;
  technicianNote?: string | null;
  entries: Array<{
    parameterId: string;
    value?: number | null;
    valueText?: string | null;
    criticalAckNote?: string | null;
  }>;
};

export type PathologistProfile = {
  userId: string;
  fullName: string;
  medicalLicenseNumber: string;
  digitalSignatureUrl: string | null;
};

export type BatchVerifyInput = {
  labResultIds: string[];
  digitalSignatureUrl?: string | null;
  medicalLicenseNumber?: string | null;
  pathologistName?: string | null;
};

export type RerunInput = {
  labResultId: string;
  instructions: string;
};
