export type PrescriptionOcrResult = {
  patientName: string | null;
  age: number | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  doctorName: string | null;
  detectedTests: string[];
};

export type PrescriptionOcrMatch = {
  extracted: PrescriptionOcrResult;
  matchedTests: Array<{
    testId: string;
    testName: string;
    code: string | null;
    matchedFrom: string;
    confidence: number;
  }>;
  unmatchedTests: string[];
};
