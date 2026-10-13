export type Department = {
  id: string;
  name: string;
};

export type Test = {
  id: string;
  departmentId: string;
  name: string;
  code: string | null;
};

export type TestParameter = {
  id: string;
  assignmentId: string;
  testId: string;
  name: string;
  unit: string | null;
  valueType: "NUMERIC" | "TEXT";
  inputType?: ParameterInputType;
};

export type ParameterInputType = "NUMERIC" | "DROPDOWN" | "TEXT" | "FORMULA";

export type ParameterDetail = {
  id: string;
  name: string;
  unit: string | null;
  valueType: "NUMERIC" | "TEXT";
  inputType: ParameterInputType;
  formula: string | null;
  formulaAlias: string | null;
  dropdownOptions: string[];
  criticalLow: number | null;
  criticalHigh: number | null;
  methodology: string | null;
  analyzerCode: string | null;
};

export type TestParameterStudio = TestParameter & {
  inputType: ParameterInputType;
  formula: string | null;
  formulaAlias: string | null;
  dropdownOptions: string[];
  criticalLow: number | null;
  criticalHigh: number | null;
  methodology: string | null;
  analyzerCode: string | null;
  ranges: ParameterNormalRangeRule[];
};

export type TestStudioPayload = {
  test: Test;
  departmentName: string;
  parameters: TestParameterStudio[];
};

export type PatientGender = "MALE" | "FEMALE" | "OTHER" | "ALL";

export type ParameterNormalRangeRule = {
  id: string;
  gender: PatientGender;
  ageMin: number | null;
  ageMax: number | null;
  normalMin: number | null;
  normalMax: number | null;
};

