export type TestResult = {
  testName: string;
  value: string;
  referenceRange: string;
};

export type ReportRecord = {
  id: string;
  tenantId: string;
  patientId: string;
  patientName: string;
  status: "PENDING" | "READY";
  reportUrl: string | null;
  filePath: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
