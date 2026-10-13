import { httpClient } from "../../services/http";

export type Department = { id: string; name: string };
export type Test = { id: string; departmentId: string; name: string; code: string | null };
export type Parameter = { id: string; name: string; unit: string | null; valueType: "NUMERIC" | "TEXT" };
export type TestParameter = {
  /** Parameter ID (global). */
  id: string;
  /** Assignment ID (test ↔ parameter). */
  assignmentId: string;
  testId: string;
  name: string;
  unit: string | null;
  valueType: "NUMERIC" | "TEXT";
};
export type Gender = "ALL" | "MALE" | "FEMALE" | "OTHER";
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

export type RangeRule = {
  id: string;
  gender: Gender;
  ageMin: number | null;
  ageMax: number | null;
  normalMin: number | null;
  normalMax: number | null;
};

export type TestParameterStudio = TestParameter & ParameterDetail & { ranges: RangeRule[] };

export type TestStudioPayload = {
  test: Test;
  departmentName: string;
  parameters: TestParameterStudio[];
};

export const catalogApi = {
  async listDepartments(): Promise<Department[]> {
    const { data } = await httpClient.get<{ departments: Department[] }>("/catalog/departments");
    return data.departments;
  },
  async createDepartment(name: string): Promise<Department> {
    const { data } = await httpClient.post<{ department: Department }>("/catalog/departments", { name });
    return data.department;
  },
  async listTests(departmentId: string): Promise<Test[]> {
    const { data } = await httpClient.get<{ tests: Test[] }>(`/catalog/departments/${departmentId}/tests`);
    return data.tests;
  },
  async createTest(departmentId: string, input: { name: string; code?: string | null }): Promise<Test> {
    const { data } = await httpClient.post<{ test: Test }>(`/catalog/departments/${departmentId}/tests`, input);
    return data.test;
  },
  async listParameters(testId: string): Promise<TestParameter[]> {
    const { data } = await httpClient.get<{ parameters: TestParameter[] }>(`/catalog/tests/${testId}/parameters`);
    return data.parameters;
  },
  async listAllParameters(): Promise<Parameter[]> {
    const { data } = await httpClient.get<{ parameters: Parameter[] }>("/catalog/parameters");
    return data.parameters;
  },
  async createParameter(input: { name: string; unit?: string | null; valueType?: "NUMERIC" | "TEXT" }): Promise<Parameter> {
    const { data } = await httpClient.post<{ parameter: Parameter }>("/catalog/parameters", input);
    return data.parameter;
  },
  async assignParameter(testId: string, input: { parameterId: string; sortIndex?: number }): Promise<void> {
    await httpClient.post(`/catalog/tests/${testId}/parameters`, input);
  },
  async unassignParameter(testId: string, parameterId: string): Promise<void> {
    await httpClient.delete(`/catalog/tests/${testId}/parameters/${parameterId}`);
  },
  async listRanges(parameterId: string): Promise<RangeRule[]> {
    const { data } = await httpClient.get<{ ranges: RangeRule[] }>(`/catalog/parameters/${parameterId}/ranges`);
    return data.ranges;
  },
  async replaceRanges(parameterId: string, rules: Array<Omit<RangeRule, "id">>): Promise<void> {
    await httpClient.put(`/catalog/parameters/${parameterId}/ranges`, { rules });
  },

  async getTestStudio(testId: string): Promise<TestStudioPayload> {
    const { data } = await httpClient.get<{ studio: TestStudioPayload }>(`/catalog/tests/${testId}/studio`);
    return data.studio;
  },

  async createParameterForTest(
    testId: string,
    input: {
      name: string;
      unit?: string | null;
      inputType?: ParameterInputType;
      formula?: string | null;
      formulaAlias?: string | null;
      dropdownOptions?: string[];
      criticalLow?: number | null;
      criticalHigh?: number | null;
      methodology?: string | null;
      analyzerCode?: string | null;
      sortIndex?: number;
      ranges?: Array<Omit<RangeRule, "id">>;
    }
  ): Promise<ParameterDetail> {
    const { data } = await httpClient.post<{ parameter: ParameterDetail }>(
      `/catalog/tests/${testId}/parameters/studio`,
      input
    );
    return data.parameter;
  },

  async saveParameterStudio(
    parameterId: string,
    input: {
      parameter?: Partial<{
        name: string;
        unit: string | null;
        inputType: ParameterInputType;
        formula: string | null;
        formulaAlias: string | null;
        dropdownOptions: string[];
        criticalLow: number | null;
        criticalHigh: number | null;
        methodology: string | null;
        analyzerCode: string | null;
      }>;
      ranges?: Array<Omit<RangeRule, "id">>;
    }
  ): Promise<ParameterDetail> {
    const { data } = await httpClient.put<{ parameter: ParameterDetail }>(
      `/catalog/parameters/${parameterId}/studio`,
      input
    );
    return data.parameter;
  },

  async previewFormula(formula: string, values: Record<string, number>): Promise<number | null> {
    const { data } = await httpClient.post<{ result: number | null }>("/catalog/parameters/preview-formula", {
      formula,
      values
    });
    return data.result;
  }
};

