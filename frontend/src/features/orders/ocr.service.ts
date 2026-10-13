import { httpClient } from "../../services/http";

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

export const ocrApi = {
  async parsePrescription(base64: string, mimeType?: string): Promise<PrescriptionOcrMatch> {
    const { data } = await httpClient.post<{ success: boolean; data: PrescriptionOcrMatch }>(
      "/api/ocr/parse-prescription",
      { base64, mimeType }
    );
    return data.data;
  }
};
