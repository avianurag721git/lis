export type AiProvider = "openai" | "anthropic" | "local" | "mock";

export type TestResultInput = {
  parameterName: string;
  value: string | number | null;
  unit?: string | null;
  referenceRange: string;
  isAbnormal: boolean;
  isCritical: boolean;
  flag?: string | null;
};

export type AnalyzeResultInput = {
  patientAgeYears?: number | null;
  patientGender?: string | null;
  testName?: string;
  departmentName?: string;
  testResults: TestResultInput[];
};

export type AnalyzeResultOutput = {
  clinicalImpression: string;
  provider: AiProvider;
  model: string;
  generatedAt: string;
  fallback?: boolean;
};

export type PatientSummaryInput = {
  language?: "en" | "hi";
  patientAgeYears?: number | null;
  patientGender?: string | null;
  testName?: string;
  testResults: TestResultInput[];
};

export type PatientSummaryOutput = {
  bullets: string[];
  language: "en" | "hi";
  disclaimer: string;
  provider: AiProvider;
  model: string;
  generatedAt: string;
  fallback?: boolean;
};

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCompletionRequest = {
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type LlmCompletionResponse = {
  text: string;
  provider: AiProvider;
  model: string;
};
