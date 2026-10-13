import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { Department, ParameterDetail, ParameterNormalRangeRule, Test, TestParameter, TestStudioPayload, ParameterInputType } from "./catalog.types";
import { aliasFromParameterName } from "../lab-results/formula.engine";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapParameterRow = (r: Record<string, unknown>): ParameterDetail => ({
  id: r.id as string,
  name: r.name as string,
  unit: (r.unit as string | null) ?? null,
  valueType: r.value_type as "NUMERIC" | "TEXT",
  inputType: (r.input_type as ParameterInputType) ?? "NUMERIC",
  formula: (r.formula as string | null) ?? null,
  formulaAlias: (r.formula_alias as string | null) ?? null,
  dropdownOptions: Array.isArray(r.dropdown_options) ? (r.dropdown_options as string[]) : [],
  criticalLow: r.critical_low == null ? null : Number(r.critical_low),
  criticalHigh: r.critical_high == null ? null : Number(r.critical_high),
  methodology: (r.methodology as string | null) ?? null,
  analyzerCode: (r.analyzer_code as string | null) ?? null
});

export const catalogRepository = {
  async listDepartments(tenantId: string): Promise<Department[]> {
    ensurePg();
    const result = await db.query(
      `SELECT id, name FROM departments WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
    return result.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));
  },

  async createDepartment(tenantId: string, name: string): Promise<Department> {
    ensurePg();
    const id = randomUUID();
    const cleaned = name.trim();
    const result = await db.query(
      `INSERT INTO departments (id, tenant_id, name) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET updated_at = NOW()
       RETURNING id, name`,
      [id, tenantId, cleaned]
    );
    const row = result.rows[0] as { id: string; name: string } | undefined;
    // If RETURNING didn't return (shouldn't happen), read back.
    if (!row) {
      const read = await db.query(`SELECT id, name FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [
        tenantId,
        cleaned
      ]);
      const r = read.rows[0] as { id: string; name: string } | undefined;
      if (!r) {
        throw new AppError("Department create failed", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DEPARTMENT_CREATE_FAILED");
      }
      return { id: r.id, name: r.name };
    }
    return { id: row.id, name: row.name };
  },

  async listTestsForDepartment(tenantId: string, departmentId: string): Promise<Test[]> {
    ensurePg();
    const result = await db.query(
      `SELECT id, department_id, name, code
       FROM tests
       WHERE tenant_id = $1 AND department_id = $2
       ORDER BY name ASC`,
      [tenantId, departmentId]
    );
    return result.rows.map((r: { id: string; department_id: string; name: string; code: string | null }) => ({
      id: r.id,
      departmentId: r.department_id,
      name: r.name,
      code: r.code
    }));
  },

  async createTest(
    tenantId: string,
    input: { departmentId: string; name: string; code?: string | null }
  ): Promise<Test> {
    ensurePg();
    const id = randomUUID();
    const cleaned = input.name.trim();
    const code = input.code?.trim() ? input.code.trim() : null;
    const result = await db.query(
      `INSERT INTO tests (id, tenant_id, department_id, name, code)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, department_id, name) DO UPDATE SET code = EXCLUDED.code, updated_at = NOW()
       RETURNING id, department_id, name, code`,
      [id, tenantId, input.departmentId, cleaned, code]
    );
    const row = result.rows[0] as { id: string; department_id: string; name: string; code: string | null };
    return { id: row.id, departmentId: row.department_id, name: row.name, code: row.code };
  },

  async listAllParameters(
    tenantId: string
  ): Promise<Array<{ id: string; name: string; unit: string | null; valueType: "NUMERIC" | "TEXT" }>> {
    ensurePg();
    const result = await db.query(
      `SELECT id, name, unit, value_type FROM parameters WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
    return result.rows.map((r: { id: string; name: string; unit: string | null; value_type: "NUMERIC" | "TEXT" }) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      valueType: r.value_type
    }));
  },

  async createParameter(
    tenantId: string,
    input: {
      name: string;
      unit?: string | null;
      valueType?: "NUMERIC" | "TEXT";
      inputType?: ParameterInputType;
      formula?: string | null;
      formulaAlias?: string | null;
      dropdownOptions?: string[];
      criticalLow?: number | null;
      criticalHigh?: number | null;
      methodology?: string | null;
      analyzerCode?: string | null;
    }
  ): Promise<ParameterDetail> {
    ensurePg();
    const id = randomUUID();
    const cleaned = input.name.trim();
    const unit = input.unit?.trim() ? input.unit.trim() : null;
    const valueType = input.inputType === "TEXT" || input.valueType === "TEXT" ? "TEXT" : "NUMERIC";
    const inputType = input.inputType ?? (valueType === "TEXT" ? "TEXT" : "NUMERIC");
    const formulaAlias =
      input.formulaAlias?.trim() ||
      (input.formula?.trim() ? aliasFromParameterName(cleaned) : null);
    const result = await db.query(
      `INSERT INTO parameters
       (id, tenant_id, name, unit, value_type, input_type, formula, formula_alias,
        dropdown_options, critical_low, critical_high, methodology, analyzer_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
       RETURNING *`,
      [
        id,
        tenantId,
        cleaned,
        unit,
        valueType,
        inputType,
        input.formula?.trim() || null,
        formulaAlias,
        JSON.stringify(input.dropdownOptions ?? []),
        input.criticalLow ?? null,
        input.criticalHigh ?? null,
        input.methodology?.trim() || null,
        input.analyzerCode?.trim() || null
      ]
    );
    return mapParameterRow(result.rows[0]);
  },

  async getParameterById(tenantId: string, parameterId: string): Promise<ParameterDetail | null> {
    ensurePg();
    const result = await db.query(`SELECT * FROM parameters WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      parameterId
    ]);
    return result.rows[0] ? mapParameterRow(result.rows[0]) : null;
  },

  async updateParameter(
    tenantId: string,
    parameterId: string,
    input: Partial<{
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
    }>
  ): Promise<ParameterDetail> {
    ensurePg();
    const existing = await this.getParameterById(tenantId, parameterId);
    if (!existing) {
      throw new AppError("Parameter not found", HTTP_STATUS.NOT_FOUND, "PARAMETER_NOT_FOUND");
    }

    const name = input.name?.trim() ?? existing.name;
    const unit = input.unit !== undefined ? input.unit : existing.unit;
    const inputType = input.inputType ?? existing.inputType;
    const valueType =
      input.valueType ??
      (inputType === "TEXT" ? "TEXT" : existing.valueType);
    const formula = input.formula !== undefined ? input.formula : existing.formula;
    const formulaAlias =
      input.formulaAlias !== undefined
        ? input.formulaAlias
        : formula
          ? existing.formulaAlias ?? aliasFromParameterName(name)
          : null;

    const result = await db.query(
      `UPDATE parameters SET
         name = $3, unit = $4, value_type = $5, input_type = $6,
         formula = $7, formula_alias = $8, dropdown_options = $9::jsonb,
         critical_low = $10, critical_high = $11, methodology = $12, analyzer_code = $13,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        parameterId,
        name,
        unit,
        valueType,
        inputType,
        formula,
        formulaAlias,
        JSON.stringify(input.dropdownOptions ?? existing.dropdownOptions),
        input.criticalLow !== undefined ? input.criticalLow : existing.criticalLow,
        input.criticalHigh !== undefined ? input.criticalHigh : existing.criticalHigh,
        input.methodology !== undefined ? input.methodology : existing.methodology,
        input.analyzerCode !== undefined ? input.analyzerCode : existing.analyzerCode
      ]
    );
    return mapParameterRow(result.rows[0]);
  },

  async getTestStudio(tenantId: string, testId: string): Promise<TestStudioPayload | null> {
    ensurePg();
    const testRow = await db.query(
      `SELECT t.*, d.name AS department_name
       FROM tests t
       JOIN departments d ON d.id = t.department_id
       WHERE t.tenant_id = $1 AND t.id = $2`,
      [tenantId, testId]
    );
    if (!testRow.rows[0]) return null;

    const t = testRow.rows[0];
    const params = await db.query(
      `SELECT p.*, a.id AS assignment_id, a.test_id, a.sort_index
       FROM test_parameter_assignments a
       JOIN parameters p ON p.id = a.parameter_id
       WHERE a.tenant_id = $1 AND a.test_id = $2
       ORDER BY a.sort_index ASC, p.name ASC`,
      [tenantId, testId]
    );

    const parameters = [];
    for (const row of params.rows) {
      const detail = mapParameterRow(row);
      const ranges = await this.listRangesForParameter(tenantId, detail.id);
      parameters.push({
        id: detail.id,
        assignmentId: row.assignment_id as string,
        testId: row.test_id as string,
        name: detail.name,
        unit: detail.unit,
        valueType: detail.valueType,
        inputType: detail.inputType,
        formula: detail.formula,
        formulaAlias: detail.formulaAlias,
        dropdownOptions: detail.dropdownOptions,
        criticalLow: detail.criticalLow,
        criticalHigh: detail.criticalHigh,
        methodology: detail.methodology,
        analyzerCode: detail.analyzerCode,
        ranges
      });
    }

    return {
      test: {
        id: t.id as string,
        departmentId: t.department_id as string,
        name: t.name as string,
        code: (t.code as string | null) ?? null
      },
      departmentName: t.department_name as string,
      parameters
    };
  },

  async createParameterForTest(
    tenantId: string,
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
      ranges?: Array<Omit<ParameterNormalRangeRule, "id">>;
    }
  ): Promise<ParameterDetail> {
    const parameter = await this.createParameter(tenantId, input);
    await this.assignParameterToTest(tenantId, {
      testId,
      parameterId: parameter.id,
      ...(input.sortIndex != null ? { sortIndex: input.sortIndex } : {})
    });
    if (input.ranges?.length) {
      await this.replaceRangesForParameter(tenantId, parameter.id, input.ranges);
    }
    return parameter;
  },

  async saveParameterStudio(
    tenantId: string,
    parameterId: string,
    input: {
      parameter: Partial<{
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
      ranges?: Array<Omit<ParameterNormalRangeRule, "id">>;
    }
  ): Promise<ParameterDetail> {
    const updated = await this.updateParameter(tenantId, parameterId, input.parameter);
    if (input.ranges) {
      await this.replaceRangesForParameter(tenantId, parameterId, input.ranges);
    }
    return updated;
  },

  async listParametersForTest(tenantId: string, testId: string): Promise<TestParameter[]> {
    ensurePg();
    const result = await db.query(
      `SELECT
         p.id AS parameter_id,
         a.id AS assignment_id,
         a.test_id,
         p.name,
         p.unit,
         p.value_type
       FROM test_parameter_assignments a
       JOIN parameters p ON p.id = a.parameter_id
       WHERE a.tenant_id = $1 AND a.test_id = $2
       ORDER BY a.sort_index ASC, p.name ASC`,
      [tenantId, testId]
    );
    return result.rows.map(
      (r: {
        parameter_id: string;
        assignment_id: string;
        test_id: string;
        name: string;
        unit: string | null;
        value_type: "NUMERIC" | "TEXT";
      }) => ({
        id: r.parameter_id,
        assignmentId: r.assignment_id,
        testId: r.test_id,
        name: r.name,
        unit: r.unit,
        valueType: r.value_type
      })
    );
  },

  async assignParameterToTest(tenantId: string, input: { testId: string; parameterId: string; sortIndex?: number }): Promise<void> {
    ensurePg();
    const id = randomUUID();
    const sortIndex = Number.isInteger(input.sortIndex) ? (input.sortIndex as number) : 0;
    await db.query(
      `INSERT INTO test_parameter_assignments (id, tenant_id, test_id, parameter_id, sort_index)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, test_id, parameter_id) DO UPDATE SET
         sort_index = EXCLUDED.sort_index,
         updated_at = NOW()`,
      [id, tenantId, input.testId, input.parameterId, sortIndex]
    );
  },

  async unassignParameterFromTest(tenantId: string, input: { testId: string; parameterId: string }): Promise<void> {
    ensurePg();
    await db.query(
      `DELETE FROM test_parameter_assignments WHERE tenant_id = $1 AND test_id = $2 AND parameter_id = $3`,
      [tenantId, input.testId, input.parameterId]
    );
  },

  async listRangesForParameter(tenantId: string, parameterId: string): Promise<ParameterNormalRangeRule[]> {
    ensurePg();
    const result = await db.query(
      `SELECT id, gender, age_min, age_max, normal_min, normal_max
       FROM parameter_normal_ranges
       WHERE tenant_id = $1 AND parameter_id = $2
       ORDER BY gender ASC, age_min ASC NULLS FIRST, age_max ASC NULLS LAST`,
      [tenantId, parameterId]
    );
    return result.rows.map(
      (r: {
        id: string;
        gender: string;
        age_min: number | null;
        age_max: number | null;
        normal_min: string | number | null;
        normal_max: string | number | null;
      }) => ({
        id: r.id,
        gender: r.gender as ParameterNormalRangeRule["gender"],
        ageMin: r.age_min,
        ageMax: r.age_max,
        normalMin: r.normal_min == null ? null : Number(r.normal_min),
        normalMax: r.normal_max == null ? null : Number(r.normal_max)
      })
    );
  },

  async replaceRangesForParameter(
    tenantId: string,
    parameterId: string,
    rules: Array<Omit<ParameterNormalRangeRule, "id">>
  ): Promise<void> {
    ensurePg();
    await db.transaction(async (client) => {
      await client.query(`DELETE FROM parameter_normal_ranges WHERE tenant_id = $1 AND parameter_id = $2`, [
        tenantId,
        parameterId
      ]);

      for (const rule of rules) {
        const id = randomUUID();
        await client.query(
          `INSERT INTO parameter_normal_ranges
           (id, tenant_id, parameter_id, gender, age_min, age_max, normal_min, normal_max)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            tenantId,
            parameterId,
            rule.gender,
            rule.ageMin,
            rule.ageMax,
            rule.normalMin,
            rule.normalMax
          ]
        );
      }
    });
  }
};

