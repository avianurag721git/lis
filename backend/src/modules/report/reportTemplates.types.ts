export type PatientGender = "MALE" | "FEMALE" | "OTHER";

export type ReportTemplateType = "STANDARD" | "DETAILED";

export type ParameterNormalRange = {
  normalMin: number | null;
  normalMax: number | null;
  referenceRange: string;
};

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

export type ParameterEvaluation = {
  parameterId: string;
  value: string;
  referenceRange: string | null;
  abnormal: boolean;
  parameterName?: string;
  unit?: string | null;
  testName?: string;
  departmentName?: string;
};

