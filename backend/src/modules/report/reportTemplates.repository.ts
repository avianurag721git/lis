import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import {
  ActiveReportTemplate,
  PatientGender,
  ReportTemplateType,
  TemplateItem
} from "./reportTemplates.types";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

type TemplateRow = {
  id: string;
  template_type: ReportTemplateType;
  name: string;
  show_reference_range: boolean;
  auto_bold_abnormal: boolean;
  group_by_test: boolean;
};

type TemplateItemRow = {
  parameter_id: string;
  parameter_name: string;
  test_name: string;
  department_name: string;
  unit: string | null;
  sort_index: number;
  show_reference_range_override: boolean | null;
};

type NormalRangeRuleRow = {
  parameter_id: string;
  gender: PatientGender | "ALL";
  age_min: number | null;
  age_max: number | null;
  normal_min: string | number | null;
  normal_max: string | number | null;
};

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured for report templates", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

export const reportTemplatesRepository = {
  async ensureDefaultCatalogForTenant(tenantId: string): Promise<void> {
    ensurePg();

    let standardExists;
    try {
      standardExists = await db.query(
        `SELECT id FROM report_templates WHERE tenant_id = $1 AND template_type = 'STANDARD' LIMIT 1`,
        [tenantId]
      );
    } catch (err: unknown) {
      throw new AppError(
        "Report templates schema missing. Run backend/database/report_templates.sql against Postgres (and restart containers).",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "REPORT_TEMPLATES_SCHEMA_MISSING"
      );
    }
    if (standardExists.rows.length > 0) return;

    const templateStandard = randomUUID();
    const templateDetailed = randomUUID();

    await db.transaction(async (client) => {
      const upsertDepartment = async (name: string): Promise<string> => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO departments (id, tenant_id, name)
           VALUES ($1,$2,$3)
           ON CONFLICT (tenant_id, name) DO NOTHING`,
          [id, tenantId, name]
        );
        const row = (await client.query(`SELECT id FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, name]))
          .rows[0] as { id: string } | undefined;
        return row?.id ?? id;
      };

      const upsertTest = async (
        departmentId: string,
        name: string,
        code?: string,
        meta?: { priceMinor?: number; sampleType?: string; tubeColor?: string }
      ): Promise<string> => {
        const id = randomUUID();
        const priceMinor = meta?.priceMinor ?? 50000;
        const sampleType = meta?.sampleType ?? "BLOOD";
        const tubeColor = meta?.tubeColor ?? "PURPLE";
        await client.query(
          `INSERT INTO tests (id, tenant_id, department_id, name, code, price_minor, sample_type, tube_color)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, department_id, name) DO UPDATE SET
             price_minor = COALESCE(NULLIF(tests.price_minor, 0), EXCLUDED.price_minor),
             sample_type = EXCLUDED.sample_type,
             tube_color = EXCLUDED.tube_color,
             updated_at = NOW()`,
          [id, tenantId, departmentId, name, code ?? null, priceMinor, sampleType, tubeColor]
        );
        const row = (
          await client.query(
            `SELECT id FROM tests WHERE tenant_id = $1 AND department_id = $2 AND name = $3 LIMIT 1`,
            [tenantId, departmentId, name]
          )
        ).rows[0] as { id: string } | undefined;
        return row?.id ?? id;
      };

      const createOrFindParameter = async (name: string, unit: string | null): Promise<string> => {
        const id = randomUUID();
        const cleanedName = name.trim();
        const cleanedUnit = unit?.trim() ? unit.trim() : null;

        // No natural uniqueness enforced at DB level (labs can vary). We dedupe by (name, unit) for the default seed only.
        const existing = (
          await client.query(
            `SELECT id FROM parameters WHERE tenant_id = $1 AND name = $2 AND unit IS NOT DISTINCT FROM $3 LIMIT 1`,
            [tenantId, cleanedName, cleanedUnit]
          )
        ).rows[0] as { id: string } | undefined;
        if (existing?.id) return existing.id;

        await client.query(
          `INSERT INTO parameters (id, tenant_id, name, unit, value_type)
           VALUES ($1,$2,$3,$4,'NUMERIC')`,
          [id, tenantId, cleanedName, cleanedUnit]
        );
        return id;
      };

      const assignParameter = async (testId: string, parameterId: string, sortIndex: number): Promise<void> => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO test_parameter_assignments (id, tenant_id, test_id, parameter_id, sort_index)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (tenant_id, test_id, parameter_id) DO UPDATE SET
             sort_index = EXCLUDED.sort_index,
             updated_at = NOW()`,
          [id, tenantId, testId, parameterId, sortIndex]
        );
      };

      const upsertRange = async (input: {
        parameterId: string;
        gender: PatientGender | "ALL";
        ageMin: number | null;
        ageMax: number | null;
        normalMin: number | null;
        normalMax: number | null;
      }): Promise<void> => {
        const ruleId = randomUUID();
        await client.query(
          `INSERT INTO parameter_normal_ranges
           (id, tenant_id, parameter_id, gender, age_min, age_max, normal_min, normal_max)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, parameter_id, gender, age_min, age_max) DO UPDATE SET
             normal_min = EXCLUDED.normal_min,
             normal_max = EXCLUDED.normal_max,
             updated_at = NOW()`,
          [ruleId, tenantId, input.parameterId, input.gender, input.ageMin, input.ageMax, input.normalMin, input.normalMax]
        );
      };

      // Starter catalog (adult ranges, 18-120). You can extend via DB later.
      const depHematology = await upsertDepartment("Hematology");
      const depBiochemistry = await upsertDepartment("Biochemistry");
      const depLFT = await upsertDepartment("Liver Function Test (LFT)");
      const depKFT = await upsertDepartment("Kidney Function Test (KFT)");
      const depLipid = await upsertDepartment("Lipid Profile");
      const depThyroid = await upsertDepartment("Thyroid Profile");
      const depElectrolytes = await upsertDepartment("Electrolytes");

      // CBC (common)
      const testCBC = await upsertTest(depHematology, "Complete Blood Count (CBC)", "CBC", {
        priceMinor: 45000,
        sampleType: "BLOOD",
        tubeColor: "PURPLE"
      });
      const pHb = await createOrFindParameter("Hemoglobin", "g/dL");
      const pRbc = await createOrFindParameter("RBC", "million/uL");
      const pWbc = await createOrFindParameter("WBC", "/uL");
      const pPlt = await createOrFindParameter("Platelet", "/uL");
      const pHct = await createOrFindParameter("Hematocrit (HCT)", "%");
      const pMcv = await createOrFindParameter("MCV", "fL");
      const pMch = await createOrFindParameter("MCH", "pg");
      const pMchc = await createOrFindParameter("MCHC", "g/dL");
      await assignParameter(testCBC, pHb, 10);
      await assignParameter(testCBC, pRbc, 20);
      await assignParameter(testCBC, pWbc, 30);
      await assignParameter(testCBC, pPlt, 40);
      await assignParameter(testCBC, pHct, 50);
      await assignParameter(testCBC, pMcv, 60);
      await assignParameter(testCBC, pMch, 70);
      await assignParameter(testCBC, pMchc, 80);

      // Adult ranges (approx baseline)
      await upsertRange({ parameterId: pHb, gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 13.5, normalMax: 17.5 });
      await upsertRange({ parameterId: pHb, gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 12.0, normalMax: 16.0 });
      await upsertRange({ parameterId: pHb, gender: "OTHER", ageMin: 18, ageMax: 120, normalMin: 12.0, normalMax: 16.0 });
      await upsertRange({ parameterId: pRbc, gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 4.5, normalMax: 5.9 });
      await upsertRange({ parameterId: pRbc, gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 4.1, normalMax: 5.1 });
      await upsertRange({ parameterId: pRbc, gender: "OTHER", ageMin: 18, ageMax: 120, normalMin: 4.1, normalMax: 5.1 });
      await upsertRange({ parameterId: pWbc, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 4000, normalMax: 11000 });
      await upsertRange({ parameterId: pPlt, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 150000, normalMax: 450000 });
      await upsertRange({ parameterId: pHct, gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 41, normalMax: 53 });
      await upsertRange({ parameterId: pHct, gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 36, normalMax: 46 });
      await upsertRange({ parameterId: pHct, gender: "OTHER", ageMin: 18, ageMax: 120, normalMin: 36, normalMax: 46 });
      await upsertRange({ parameterId: pMcv, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 80, normalMax: 100 });
      await upsertRange({ parameterId: pMch, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 27, normalMax: 33 });
      await upsertRange({ parameterId: pMchc, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 32, normalMax: 36 });

      // Biochemistry basics
      const testGlucose = await upsertTest(depBiochemistry, "Glucose (Fasting)", "GLU_F", {
        priceMinor: 15000,
        sampleType: "BLOOD",
        tubeColor: "GREY"
      });
      const pGlu = await createOrFindParameter("Glucose (Fasting)", "mg/dL");
      await assignParameter(testGlucose, pGlu, 10);
      await upsertRange({ parameterId: pGlu, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 70, normalMax: 99 });

      // LFT
      const testLft = await upsertTest(depLFT, "LFT Panel", "LFT", { priceMinor: 70000, sampleType: "BLOOD", tubeColor: "GOLD" });
      const pAlt = await createOrFindParameter("ALT (SGPT)", "U/L");
      const pAst = await createOrFindParameter("AST (SGOT)", "U/L");
      const pAlp = await createOrFindParameter("ALP", "U/L");
      const pBiliT = await createOrFindParameter("Bilirubin Total", "mg/dL");
      const pAlbumin = await createOrFindParameter("Albumin", "g/dL");
      await assignParameter(testLft, pAlt, 10);
      await assignParameter(testLft, pAst, 20);
      await assignParameter(testLft, pAlp, 30);
      await assignParameter(testLft, pBiliT, 40);
      await assignParameter(testLft, pAlbumin, 50);
      await upsertRange({ parameterId: pAlt, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 55 });
      await upsertRange({ parameterId: pAst, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 40 });
      await upsertRange({ parameterId: pAlp, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 44, normalMax: 147 });
      await upsertRange({ parameterId: pBiliT, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0.3, normalMax: 1.2 });
      await upsertRange({ parameterId: pAlbumin, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 3.5, normalMax: 5.0 });

      // KFT
      const testKft = await upsertTest(depKFT, "KFT Panel", "KFT", { priceMinor: 65000, sampleType: "BLOOD", tubeColor: "GOLD" });
      const pUrea = await createOrFindParameter("Urea", "mg/dL");
      const pCreat = await createOrFindParameter("Creatinine", "mg/dL");
      await assignParameter(testKft, pUrea, 10);
      await assignParameter(testKft, pCreat, 20);
      await upsertRange({ parameterId: pUrea, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 15, normalMax: 40 });
      await upsertRange({ parameterId: pCreat, gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 0.7, normalMax: 1.3 });
      await upsertRange({ parameterId: pCreat, gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 0.6, normalMax: 1.1 });
      await upsertRange({ parameterId: pCreat, gender: "OTHER", ageMin: 18, ageMax: 120, normalMin: 0.6, normalMax: 1.1 });

      // Lipid profile
      const testLipid = await upsertTest(depLipid, "Lipid Profile", "LIPID", {
        priceMinor: 80000,
        sampleType: "BLOOD",
        tubeColor: "GOLD"
      });
      const pChol = await createOrFindParameter("Total Cholesterol", "mg/dL");
      const pTg = await createOrFindParameter("Triglycerides", "mg/dL");
      const pHdl = await createOrFindParameter("HDL", "mg/dL");
      const pLdl = await createOrFindParameter("LDL", "mg/dL");
      await assignParameter(testLipid, pChol, 10);
      await assignParameter(testLipid, pTg, 20);
      await assignParameter(testLipid, pHdl, 30);
      await assignParameter(testLipid, pLdl, 40);
      await upsertRange({ parameterId: pChol, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 200 });
      await upsertRange({ parameterId: pTg, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 150 });
      await upsertRange({ parameterId: pHdl, gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 40, normalMax: null });
      await upsertRange({ parameterId: pHdl, gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 50, normalMax: null });
      await upsertRange({ parameterId: pHdl, gender: "OTHER", ageMin: 18, ageMax: 120, normalMin: 45, normalMax: null });
      await upsertRange({ parameterId: pLdl, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 100 });

      // Thyroid
      const testThyroid = await upsertTest(depThyroid, "Thyroid Profile", "THY", {
        priceMinor: 90000,
        sampleType: "BLOOD",
        tubeColor: "RED"
      });
      const pTsh = await createOrFindParameter("TSH", "uIU/mL");
      await assignParameter(testThyroid, pTsh, 10);
      await upsertRange({ parameterId: pTsh, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 0.4, normalMax: 4.0 });

      // Electrolytes
      const testElec = await upsertTest(depElectrolytes, "Electrolytes", "EL", {
        priceMinor: 40000,
        sampleType: "BLOOD",
        tubeColor: "GREEN"
      });
      const pNa = await createOrFindParameter("Sodium (Na)", "mmol/L");
      const pK = await createOrFindParameter("Potassium (K)", "mmol/L");
      const pCl = await createOrFindParameter("Chloride (Cl)", "mmol/L");
      await assignParameter(testElec, pNa, 10);
      await assignParameter(testElec, pK, 20);
      await assignParameter(testElec, pCl, 30);
      await upsertRange({ parameterId: pNa, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 135, normalMax: 145 });
      await upsertRange({ parameterId: pK, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 3.5, normalMax: 5.1 });
      await upsertRange({ parameterId: pCl, gender: "ALL", ageMin: 18, ageMax: 120, normalMin: 98, normalMax: 107 });

      // Templates
      await client.query(
        `INSERT INTO report_templates
         (id, tenant_id, template_type, name, show_reference_range, auto_bold_abnormal, group_by_test)
         VALUES ($1,$2,'STANDARD',$3,TRUE,TRUE,TRUE)
         ON CONFLICT (tenant_id, template_type) DO UPDATE SET
           name = EXCLUDED.name,
           show_reference_range = EXCLUDED.show_reference_range,
           auto_bold_abnormal = EXCLUDED.auto_bold_abnormal,
           group_by_test = EXCLUDED.group_by_test,
           updated_at = NOW()`,
        [templateStandard, tenantId, "Standard Lab Report"]
      );

      await client.query(
        `INSERT INTO report_templates
         (id, tenant_id, template_type, name, show_reference_range, auto_bold_abnormal, group_by_test)
         VALUES ($1,$2,'DETAILED',$3,TRUE,TRUE,TRUE)
         ON CONFLICT (tenant_id, template_type) DO UPDATE SET
           name = EXCLUDED.name,
           show_reference_range = EXCLUDED.show_reference_range,
           auto_bold_abnormal = EXCLUDED.auto_bold_abnormal,
           group_by_test = EXCLUDED.group_by_test,
           updated_at = NOW()`,
        [templateDetailed, tenantId, "Detailed Lab Report"]
      );
    });
  },

  async getActiveTemplateWithItems(
    tenantId: string,
    templateType: ReportTemplateType
  ): Promise<ActiveReportTemplate> {
    ensurePg();
    await this.ensureDefaultCatalogForTenant(tenantId);

    const templateResult = await db.query(
      `SELECT id, template_type, name, show_reference_range, auto_bold_abnormal, group_by_test
       FROM report_templates
       WHERE tenant_id = $1 AND template_type = $2
       LIMIT 1`,
      [tenantId, templateType]
    );
    const templateRow = templateResult.rows[0] as TemplateRow | undefined;
    if (!templateRow) {
      throw new AppError("Active report template not found", HTTP_STATUS.NOT_FOUND, "TEMPLATE_NOT_FOUND");
    }

    /**
     * Core behavior: template includes ALL parameters in the tenant catalog
     * (every department/test/parameter). This makes report generation complete by default.
     *
     * We still keep `report_template_items` for future per-tenant customization,
     * but for now we return the full catalog for best UX and completeness.
     */
    const itemsResult = await db.query(
      `SELECT
         p.id AS parameter_id,
         p.name AS parameter_name,
         t.name AS test_name,
         d.name AS department_name,
         p.unit
       FROM test_parameter_assignments a
       JOIN parameters p ON p.id = a.parameter_id
       JOIN tests t ON t.id = a.test_id
       JOIN departments d ON d.id = t.department_id
       WHERE a.tenant_id = $1
       ORDER BY d.name ASC, t.name ASC, a.sort_index ASC, p.name ASC`,
      [tenantId]
    );

    const rows = itemsResult.rows as Array<Omit<TemplateItemRow, "sort_index" | "show_reference_range_override">>;
    const items: TemplateItem[] = rows.map((r, idx) => ({
      parameterId: r.parameter_id,
      parameterName: r.parameter_name,
      testName: r.test_name,
      departmentName: r.department_name,
      unit: r.unit,
      sortIndex: idx,
      showReferenceRange: templateRow.show_reference_range
    }));

    return {
      templateId: templateRow.id,
      templateType: templateRow.template_type,
      name: templateRow.name,
      showReferenceRange: templateRow.show_reference_range,
      autoBoldAbnormal: templateRow.auto_bold_abnormal,
      groupByTest: templateRow.group_by_test,
      items
    };
  },

  async getNormalRangesForParameters(tenantId: string, parameterIds: string[]): Promise<NormalRangeRuleRow[]> {
    ensurePg();
    if (parameterIds.length === 0) return [];
    const result = await db.query(
      `SELECT parameter_id, gender, age_min, age_max, normal_min, normal_max
       FROM parameter_normal_ranges
       WHERE tenant_id = $1 AND parameter_id = ANY($2::uuid[])`,
      [tenantId, parameterIds]
    );
    return result.rows as NormalRangeRuleRow[];
  }
};

