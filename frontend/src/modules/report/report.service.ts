import { httpClient } from "../../services/http";

export type PatientGender = "MALE" | "FEMALE" | "OTHER";
export type ReportTemplateType = "STANDARD" | "DETAILED";

export type TemplateItem = {
  parameterId: string;
  parameterName: string;
  testName?: string;
  departmentName?: string;
  unit: string | null;
  sortIndex: number;
  showReferenceRange: boolean;
};

export type ActiveReportTemplate = {
  templateId: string;
  templateType: ReportTemplateType;
  name: string;
  showReferenceRange: boolean;
  autoBoldAbnormal: boolean;
  groupByTest: boolean;
  items: TemplateItem[];
};

type TestResult = { testName: string; value: string; referenceRange: string };

type ParameterValue = {
  parameterId: string;
  value: string;
};

export const reportApi = {
  async getActiveTemplateForPatient(input: { patientGender: PatientGender; patientAgeYears: number }): Promise<{
    template: ActiveReportTemplate;
    itemsWithReference: Array<{ parameterId: string; referenceRange: string }>;
  }> {
    const { data } = await httpClient.get("/reports/templates/active", {
      params: {
        patientGender: input.patientGender,
        patientAgeYears: input.patientAgeYears
      }
    });
    return data;
  },

  async evaluateParameters(payload: {
    patientGender: PatientGender;
    patientAgeYears: number;
    templateType?: ReportTemplateType;
    parameterValues: ParameterValue[];
  }): Promise<{
    evaluations: Array<{
      parameterId: string;
      value: string;
      referenceRange: string | null;
      abnormal: boolean;
      parameterName?: string;
      unit?: string | null;
    }>;
  }> {
    const { data } = await httpClient.post("/reports/evaluate", payload);
    return data;
  },

  async generate(payload: {
    patientId: string;
    patientName: string;
    patientPhone: string;
    pathologistName: string;
    patientGender: PatientGender;
    patientAgeYears: number;
    templateType?: ReportTemplateType;
    parameterResults: Array<{ parameterId: string; value: string }>;
  }): Promise<{ reportId: string; reportUrl: string }> {
    const { data } = await httpClient.post("/reports", payload);
    return data;
  },

  async getStatus(reportId: string): Promise<{ status: "PENDING" | "READY"; reportUrl: string | null }> {
    const { data } = await httpClient.get(`/reports/${reportId}/status`);
    return data;
  },
  getDownloadUrl(reportId: string): string {
    return `${httpClient.defaults.baseURL}/reports/${reportId}/download`;
  }
};
