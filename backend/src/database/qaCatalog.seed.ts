import { randomUUID } from "crypto";
import { db } from "./postgres";
import { PatientGender } from "../modules/report/reportTemplates.types";

type ParamSpec = {
  name: string;
  unit: string | null;
  sort: number;
  formulaAlias?: string;
  formula?: string;
  ranges?: Array<{
    gender: PatientGender | "ALL";
    ageMin: number | null;
    ageMax: number | null;
    normalMin: number | null;
    normalMax: number | null;
  }>;
};

type TestSpec = {
  department: string;
  name: string;
  code: string;
  priceMinor: number;
  sampleType?: string;
  tubeColor?: string;
  parameters: ParamSpec[];
};

const adult = (normalMin: number | null, normalMax: number | null) => [
  { gender: "ALL" as const, ageMin: 18, ageMax: 120, normalMin, normalMax }
];

const QA_TESTS: TestSpec[] = [
  {
    department: "Hematology",
    name: "Complete Blood Count (CBC)",
    code: "CBC",
    priceMinor: 45000,
    tubeColor: "PURPLE",
    parameters: [
      { name: "Hemoglobin", unit: "g/dL", sort: 10, ranges: [{ gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 13.5, normalMax: 17.5 }, { gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 12, normalMax: 16 }] },
      { name: "RBC", unit: "million/uL", sort: 20, ranges: [{ gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 4.5, normalMax: 5.9 }, { gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 4.1, normalMax: 5.1 }] },
      { name: "WBC", unit: "/uL", sort: 30, ranges: adult(4000, 11000) },
      { name: "Platelet", unit: "/uL", sort: 40, ranges: adult(150000, 450000) },
      { name: "Hematocrit (HCT)", unit: "%", sort: 50, ranges: [{ gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 41, normalMax: 53 }, { gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 36, normalMax: 46 }] },
      { name: "MCV", unit: "fL", sort: 60, ranges: adult(80, 100) },
      { name: "MCH", unit: "pg", sort: 70, ranges: adult(27, 33) },
      { name: "MCHC", unit: "g/dL", sort: 80, ranges: adult(32, 36) },
      { name: "RDW", unit: "%", sort: 90, ranges: adult(11.5, 14.5) },
      { name: "MPV", unit: "fL", sort: 100, ranges: adult(7.5, 11.5) },
      { name: "Neutrophils", unit: "%", sort: 110, ranges: adult(40, 70) },
      { name: "Lymphocytes", unit: "%", sort: 120, ranges: adult(20, 40) },
      { name: "Monocytes", unit: "%", sort: 130, ranges: adult(2, 8) },
      { name: "Eosinophils", unit: "%", sort: 140, ranges: adult(1, 4) },
      { name: "Basophils", unit: "%", sort: 150, ranges: adult(0, 1) },
      { name: "Neutrophils Absolute", unit: "/uL", sort: 160, ranges: adult(2000, 7000) },
      { name: "Lymphocytes Absolute", unit: "/uL", sort: 170, ranges: adult(1000, 3000) },
      { name: "ESR", unit: "mm/hr", sort: 180, ranges: [{ gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 15 }, { gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 0, normalMax: 20 }] }
    ]
  },
  {
    department: "Kidney Function Test (KFT)",
    name: "Kidney Function Test (KFT)",
    code: "KFT",
    priceMinor: 65000,
    tubeColor: "GOLD",
    parameters: [
      { name: "Serum Creatinine", unit: "mg/dL", sort: 10, formulaAlias: "Creatinine", ranges: [{ gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 0.7, normalMax: 1.3 }, { gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 0.6, normalMax: 1.1 }] },
      { name: "Urea", unit: "mg/dL", sort: 20, formulaAlias: "Urea", ranges: adult(15, 40) },
      { name: "Uric Acid", unit: "mg/dL", sort: 30, ranges: adult(3.5, 7.2) },
      { name: "Sodium (Na)", unit: "mmol/L", sort: 40, formulaAlias: "Sodium", ranges: adult(135, 145) },
      { name: "Potassium (K)", unit: "mmol/L", sort: 50, formulaAlias: "Potassium", ranges: adult(3.5, 5.1) },
      { name: "Chloride (Cl)", unit: "mmol/L", sort: 60, formulaAlias: "Chloride", ranges: adult(98, 107) },
      {
        name: "eGFR",
        unit: "mL/min/1.73m2",
        sort: 70,
        formulaAlias: "eGFR",
        formula: "(140 - 40) * 70 / (72 * Creatinine)",
        ranges: adult(60, 120)
      }
    ]
  },
  {
    department: "Liver Function Test (LFT)",
    name: "Liver Function Test (LFT)",
    code: "LFT",
    priceMinor: 70000,
    tubeColor: "GOLD",
    parameters: [
      { name: "Bilirubin Total", unit: "mg/dL", sort: 10, formulaAlias: "Total_Bilirubin", ranges: adult(0.3, 1.2) },
      { name: "Bilirubin Direct", unit: "mg/dL", sort: 20, formulaAlias: "Direct_Bilirubin", ranges: adult(0, 0.3) },
      { name: "Bilirubin Indirect", unit: "mg/dL", sort: 30, formulaAlias: "Indirect_Bilirubin", formula: "Total_Bilirubin - Direct_Bilirubin", ranges: adult(0.2, 0.8) },
      { name: "SGOT (AST)", unit: "U/L", sort: 40, ranges: adult(0, 40) },
      { name: "SGPT (ALT)", unit: "U/L", sort: 50, ranges: adult(0, 55) },
      { name: "Alkaline Phosphatase", unit: "U/L", sort: 60, ranges: adult(44, 147) },
      { name: "Total Protein", unit: "g/dL", sort: 70, formulaAlias: "Total_Protein", ranges: adult(6, 8.3) },
      { name: "Albumin", unit: "g/dL", sort: 80, formulaAlias: "Albumin", ranges: adult(3.5, 5) },
      { name: "Globulin", unit: "g/dL", sort: 90, formulaAlias: "Globulin", formula: "Total_Protein - Albumin", ranges: adult(2, 3.5) },
      { name: "A/G Ratio", unit: "ratio", sort: 100, formulaAlias: "AG_Ratio", formula: "Albumin / Globulin", ranges: adult(1, 2.5) }
    ]
  },
  {
    department: "Lipid Profile",
    name: "Lipid Profile",
    code: "LIPID",
    priceMinor: 80000,
    tubeColor: "GOLD",
    parameters: [
      { name: "Total Cholesterol", unit: "mg/dL", sort: 10, formulaAlias: "Total_Cholesterol", ranges: adult(0, 200) },
      { name: "Triglycerides", unit: "mg/dL", sort: 20, formulaAlias: "Triglycerides", ranges: adult(0, 150) },
      { name: "HDL", unit: "mg/dL", sort: 30, formulaAlias: "HDL", ranges: adult(40, null) },
      { name: "LDL", unit: "mg/dL", sort: 40, formulaAlias: "LDL", formula: "Total_Cholesterol - HDL - (Triglycerides / 5)", ranges: adult(0, 100) },
      { name: "VLDL", unit: "mg/dL", sort: 50, formulaAlias: "VLDL", formula: "Triglycerides / 5", ranges: adult(5, 40) }
    ]
  },
  {
    department: "Thyroid Profile",
    name: "Thyroid Profile",
    code: "THY",
    priceMinor: 90000,
    tubeColor: "RED",
    parameters: [
      { name: "T3", unit: "ng/dL", sort: 10, ranges: adult(80, 200) },
      { name: "T4", unit: "ug/dL", sort: 20, ranges: adult(4.5, 12) },
      { name: "TSH", unit: "uIU/mL", sort: 30, ranges: adult(0.4, 4) }
    ]
  }
];

const PACKAGE_NAME = "Master Health Checkup Package";
const PACKAGE_CODE = "MHC";
const PACKAGE_PRICE = 250000;

export const seedQaCatalog = async (tenantId: string): Promise<{ testIds: Record<string, string> }> => {
  const testIds: Record<string, string> = {};

  await db.transaction(async (client) => {
    const upsertDepartment = async (name: string): Promise<string> => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO departments (id, tenant_id, name) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, name) DO NOTHING`,
        [id, tenantId, name]
      );
      const row = (await client.query(`SELECT id FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, name]))
        .rows[0] as { id: string };
      return row.id;
    };

    const upsertParameter = async (spec: ParamSpec): Promise<string> => {
      const existing = (
        await client.query(`SELECT id FROM parameters WHERE tenant_id = $1 AND name = $2 AND unit IS NOT DISTINCT FROM $3 LIMIT 1`, [
          tenantId,
          spec.name,
          spec.unit
        ])
      ).rows[0] as { id: string } | undefined;
      if (existing?.id) {
        await client.query(
          `UPDATE parameters SET formula_alias = COALESCE($3, formula_alias), formula = COALESCE($4, formula), updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [existing.id, tenantId, spec.formulaAlias ?? null, spec.formula ?? null]
        );
        return existing.id;
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO parameters (id, tenant_id, name, unit, value_type, formula_alias, formula)
         VALUES ($1,$2,$3,$4,'NUMERIC',$5,$6)`,
        [id, tenantId, spec.name, spec.unit, spec.formulaAlias ?? null, spec.formula ?? null]
      );
      return id;
    };

    const upsertTest = async (departmentId: string, spec: TestSpec): Promise<string> => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO tests (id, tenant_id, department_id, name, code, price_minor, sample_type, tube_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, department_id, name) DO UPDATE SET
           code = EXCLUDED.code, price_minor = EXCLUDED.price_minor, sample_type = EXCLUDED.sample_type,
           tube_color = EXCLUDED.tube_color, updated_at = NOW()`,
        [id, tenantId, departmentId, spec.name, spec.code, spec.priceMinor, spec.sampleType ?? "BLOOD", spec.tubeColor ?? "PURPLE"]
      );
      const row = (
        await client.query(`SELECT id FROM tests WHERE tenant_id = $1 AND department_id = $2 AND name = $3 LIMIT 1`, [
          tenantId,
          departmentId,
          spec.name
        ])
      ).rows[0] as { id: string };
      return row.id;
    };

    const assignParameter = async (testId: string, parameterId: string, sortIndex: number): Promise<void> => {
      await client.query(
        `INSERT INTO test_parameter_assignments (id, tenant_id, test_id, parameter_id, sort_index)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, test_id, parameter_id) DO UPDATE SET sort_index = EXCLUDED.sort_index, updated_at = NOW()`,
        [randomUUID(), tenantId, testId, parameterId, sortIndex]
      );
    };

    const upsertRange = async (
      parameterId: string,
      rule: NonNullable<ParamSpec["ranges"]>[number]
    ): Promise<void> => {
      await client.query(
        `INSERT INTO parameter_normal_ranges (id, tenant_id, parameter_id, gender, age_min, age_max, normal_min, normal_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, parameter_id, gender, age_min, age_max) DO UPDATE SET
           normal_min = EXCLUDED.normal_min, normal_max = EXCLUDED.normal_max, updated_at = NOW()`,
        [randomUUID(), tenantId, parameterId, rule.gender, rule.ageMin, rule.ageMax, rule.normalMin, rule.normalMax]
      );
    };

    for (const testSpec of QA_TESTS) {
      const depId = await upsertDepartment(testSpec.department);
      const testId = await upsertTest(depId, testSpec);
      testIds[testSpec.code] = testId;
      for (const param of testSpec.parameters) {
        const paramId = await upsertParameter(param);
        await assignParameter(testId, paramId, param.sort);
        for (const range of param.ranges ?? []) {
          await upsertRange(paramId, range);
        }
      }
    }

    const packageId = randomUUID();
    await client.query(
      `INSERT INTO test_packages (id, tenant_id, name, code, price_minor)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, name) DO UPDATE SET code = EXCLUDED.code, price_minor = EXCLUDED.price_minor, updated_at = NOW()`,
      [packageId, tenantId, PACKAGE_NAME, PACKAGE_CODE, PACKAGE_PRICE]
    );
    const pkgRow = (
      await client.query(`SELECT id FROM test_packages WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, PACKAGE_NAME])
    ).rows[0] as { id: string };

    for (const code of ["CBC", "KFT", "LFT", "LIPID", "THY"]) {
      const tid = testIds[code];
      if (!tid) continue;
      await client.query(
        `INSERT INTO test_package_items (id, tenant_id, package_id, test_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, package_id, test_id) DO NOTHING`,
        [randomUUID(), tenantId, pkgRow.id, tid]
      );
    }

    await client.query(
      `INSERT INTO report_templates (id, tenant_id, template_type, name, show_reference_range, auto_bold_abnormal, group_by_test)
       VALUES ($1,$2,'STANDARD',$3,TRUE,TRUE,TRUE)
       ON CONFLICT (tenant_id, template_type) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
      [randomUUID(), tenantId, "Standard Lab Report"]
    );
  });

  return { testIds };
};
