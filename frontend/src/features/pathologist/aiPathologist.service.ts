import { httpClient } from "../../services/http";
import type { LabResultEntry, PathologistQueueItem } from "../pathologist/pathologist.service";

export type AiAnalyzeResult = {
  clinicalImpression: string;
  provider: string;
  model: string;
  generatedAt: string;
  fallback?: boolean;
};

export type AiPatientSummary = {
  bullets: string[];
  language: "en" | "hi";
  disclaimer: string;
  provider: string;
  model: string;
  generatedAt: string;
  fallback?: boolean;
};

type ApiOk<T> = { success: true; data: T };

const mapResults = (entries: LabResultEntry[]) =>
  entries.map((e) => ({
    parameterName: e.parameterName,
    value: e.value ?? e.valueText,
    unit: e.unit,
    referenceRange: e.referenceRange,
    isAbnormal: e.isAbnormal,
    isCritical: e.isCritical,
    flag: e.flag
  }));

export const aiPathologistApi = {
  async analyzeResult(item: PathologistQueueItem): Promise<AiAnalyzeResult> {
    const { data } = await httpClient.post<ApiOk<AiAnalyzeResult>>("/api/ai/analyze-result", {
      patientAgeYears: item.patientAgeYears,
      patientGender: item.patientGender,
      testName: item.testName,
      departmentName: item.departmentName,
      testResults: mapResults(item.entries)
    });
    return data.data;
  },

  async patientSummary(
    item: PathologistQueueItem,
    language: "en" | "hi" = "en"
  ): Promise<AiPatientSummary> {
    const { data } = await httpClient.post<ApiOk<AiPatientSummary>>("/api/ai/patient-summary", {
      language,
      patientAgeYears: item.patientAgeYears,
      patientGender: item.patientGender,
      testName: item.testName,
      testResults: mapResults(item.entries)
    });
    return data.data;
  }
};
