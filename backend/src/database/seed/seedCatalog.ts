import { randomUUID } from "crypto";
import { db } from "../postgres";
import { PatientGender } from "../../modules/report/reportTemplates.types";
import { seedLog } from "./seedLogger";
import { APOLLO_TENANT_ID, PKG001_ID, PKG002_ID } from "./productionSeed.constants";

type ParamSpec = {
  name: string;
  unit: string | null;
  sort: number;
  formulaAlias?: string;
  formula?: string;
  criticalLow?: number | null;
  criticalHigh?: number | null;
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
  b2bPriceMinor: number;
  sampleType?: string;
  tubeColor?: string;
  parameters: ParamSpec[];
};

const adult = (normalMin: number | null, normalMax: number | null) => [
  { gender: "ALL" as const, ageMin: 18, ageMax: 120, normalMin, normalMax }
];

const PRODUCTION_TESTS: TestSpec[] = [
  {
    department: "Hematology",
    name: "Complete Blood Count (CBC)",
    code: "CBC001",
    priceMinor: 35000,
    b2bPriceMinor: 20000,
    tubeColor: "PURPLE",
    sampleType: "EDTA Blood",
    parameters: [
      {
        name: "Hemoglobin",
        unit: "g/dL",
        sort: 10,
        ranges: [
          { gender: "MALE", ageMin: 18, ageMax: 120, normalMin: 13.5, normalMax: 17.5 },
          { gender: "FEMALE", ageMin: 18, ageMax: 120, normalMin: 12.0, normalMax: 15.5 }
        ]
      },
      { name: "RBC Count", unit: "million/cumm", sort: 20, ranges: adult(4.2, 5.4) },
      { name: "WBC Total Count", unit: "/cumm", sort: 30, ranges: adult(4000, 11000) },
      { name: "Platelet Count", unit: "lakhs/cumm", sort: 40, ranges: adult(1.5, 4.5) },
      { name: "Neutrophils %", unit: "%", sort: 50, ranges: adult(40, 70) },
      { name: "Lymphocytes %", unit: "%", sort: 60, ranges: adult(20, 40) },
      { name: "Eosinophils %", unit: "%", sort: 70, ranges: adult(1, 4) },
      { name: "Monocytes %", unit: "%", sort: 80, ranges: adult(2, 8) }
    ]
  },
  {
    department: "Biochemistry",
    name: "Kidney Function Test (KFT)",
    code: "KFT001",
    priceMinor: 80000,
    b2bPriceMinor: 45000,
    tubeColor: "RED",
    sampleType: "Serum",
    parameters: [
      {
        name: "Serum Creatinine",
        unit: "mg/dL",
        sort: 10,
        formulaAlias: "Creatinine",
        ranges: adult(0.7, 1.3)
      },
      { name: "Blood Urea", unit: "mg/dL", sort: 20, formulaAlias: "Urea", ranges: adult(15, 40) },
      { name: "Uric Acid", unit: "mg/dL", sort: 30, ranges: adult(3.5, 7.2) },
      { name: "Serum Sodium", unit: "mmol/L", sort: 40, formulaAlias: "Sodium", ranges: adult(135, 145) },
      { name: "Serum Potassium", unit: "mmol/L", sort: 50, formulaAlias: "Potassium", ranges: adult(3.5, 5.1) },
      {
        name: "eGFR",
        unit: "mL/min/1.73m2",
        sort: 60,
        formulaAlias: "eGFR",
        formula: "175 * pow(Creatinine, -1.154) * pow(45, -0.203)",
        ranges: adult(60, 120)
      }
    ]
  },
  {
    department: "Biochemistry",
    name: "Liver Function Test (LFT)",
    code: "LFT001",
    priceMinor: 90000,
    b2bPriceMinor: 50000,
    tubeColor: "RED",
    sampleType: "Serum",
    parameters: [
      { name: "Bilirubin Total", unit: "mg/dL", sort: 10, formulaAlias: "Bilirubin_Total", ranges: adult(0.3, 1.2) },
      { name: "Bilirubin Direct", unit: "mg/dL", sort: 20, formulaAlias: "Bilirubin_Direct", ranges: adult(0, 0.3) },
      { name: "SGOT/AST", unit: "U/L", sort: 30, ranges: adult(0, 40) },
      { name: "SGPT/ALT", unit: "U/L", sort: 40, ranges: adult(0, 55) },
      { name: "Alkaline Phosphatase", unit: "U/L", sort: 50, ranges: adult(44, 147) },
      { name: "Total Protein", unit: "g/dL", sort: 60, formulaAlias: "Total_Protein", ranges: adult(6, 8.3) },
      { name: "Albumin", unit: "g/dL", sort: 70, formulaAlias: "Albumin", ranges: adult(3.5, 5) },
      {
        name: "Bilirubin Indirect",
        unit: "mg/dL",
        sort: 75,
        formulaAlias: "Bilirubin_Indirect",
        formula: "Bilirubin_Total - Bilirubin_Direct",
        ranges: adult(0.2, 0.8)
      },
      {
        name: "Globulin",
        unit: "g/dL",
        sort: 80,
        formulaAlias: "Globulin",
        formula: "Total_Protein - Albumin",
        ranges: adult(2, 3.5)
      },
      {
        name: "A/G Ratio",
        unit: "ratio",
        sort: 90,
        formulaAlias: "AG_Ratio",
        formula: "Albumin / Globulin",
        ranges: adult(1, 2.5)
      }
    ]
  },
  {
    department: "Biochemistry",
    name: "Lipid Profile",
    code: "LIPID001",
    priceMinor: 70000,
    b2bPriceMinor: 38000,
    tubeColor: "RED",
    sampleType: "Serum",
    parameters: [
      { name: "Total Cholesterol", unit: "mg/dL", sort: 10, formulaAlias: "Total_Cholesterol", ranges: adult(0, 200) },
      { name: "Triglycerides", unit: "mg/dL", sort: 20, formulaAlias: "Triglycerides", ranges: adult(0, 150) },
      { name: "HDL Cholesterol", unit: "mg/dL", sort: 30, formulaAlias: "HDL", ranges: adult(40, null) },
      {
        name: "VLDL",
        unit: "mg/dL",
        sort: 40,
        formulaAlias: "VLDL",
        formula: "Triglycerides / 5",
        ranges: adult(5, 40)
      },
      {
        name: "LDL",
        unit: "mg/dL",
        sort: 50,
        formulaAlias: "LDL",
        formula: "Total_Cholesterol - HDL - (Triglycerides / 5)",
        ranges: adult(0, 100)
      }
    ]
  },
  {
    department: "Biochemistry",
    name: "HbA1c Glycated Hemoglobin",
    code: "HBA1C001",
    priceMinor: 50000,
    b2bPriceMinor: 28000,
    tubeColor: "PURPLE",
    sampleType: "EDTA Blood",
    parameters: [
      {
        name: "HbA1c",
        unit: "%",
        sort: 10,
        formulaAlias: "HbA1c",
        criticalHigh: 6.5,
        ranges: adult(4, 5.6)
      }
    ]
  },
  {
    department: "Serology",
    name: "Thyroid Panel (T3, T4, TSH)",
    code: "THYROID001",
    priceMinor: 60000,
    b2bPriceMinor: 32000,
    tubeColor: "RED",
    sampleType: "Serum",
    parameters: [
      { name: "T3", unit: "ng/dL", sort: 10, ranges: adult(80, 200) },
      { name: "T4", unit: "ug/dL", sort: 20, ranges: adult(4.5, 12) },
      { name: "TSH", unit: "uIU/mL", sort: 30, ranges: adult(0.4, 4) }
    ]
  }
];

export type CatalogSeedResult = {
  testIds: Record<string, string>;
  paramIds: Record<string, string>;
  departmentIds: Record<string, string>;
  packageIds: { pkg001: string; pkg002: string };
};

export const seedProductionCatalog = async (tenantId: string): Promise<CatalogSeedResult> => {
  seedLog.header(`Test Catalog & Packages (${tenantId})`);
  const testIds: Record<string, string> = {};
  const paramIds: Record<string, string> = {};
  const departmentIds: Record<string, string> = {};
  // Fixed package IDs only for Apollo (clinical seed references them); other tenants get unique IDs.
  const pkg001Id = tenantId === APOLLO_TENANT_ID ? PKG001_ID : randomUUID();
  const pkg002Id = tenantId === APOLLO_TENANT_ID ? PKG002_ID : randomUUID();

  await db.transaction(async (client) => {
    const upsertDepartment = async (name: string): Promise<string> => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO departments (id, tenant_id, name) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, name) DO NOTHING`,
        [id, tenantId, name]
      );
      const row = (await client.query(`SELECT id FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, name]))
        .rows[0] as { id: string };
      departmentIds[name] = row.id;
      return row.id;
    };

    const upsertParameter = async (spec: ParamSpec): Promise<string> => {
      const existing = (
        await client.query(`SELECT id FROM parameters WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, spec.name])
      ).rows[0] as { id: string } | undefined;
      if (existing?.id) {
        await client.query(
          `UPDATE parameters SET unit = $3, formula_alias = $4, formula = $5,
           critical_low = $6, critical_high = $7, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [
            existing.id,
            tenantId,
            spec.unit,
            spec.formulaAlias ?? null,
            spec.formula ?? null,
            spec.criticalLow ?? null,
            spec.criticalHigh ?? null
          ]
        );
        paramIds[spec.name] = existing.id;
        return existing.id;
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO parameters (id, tenant_id, name, unit, value_type, formula_alias, formula, critical_low, critical_high)
         VALUES ($1,$2,$3,$4,'NUMERIC',$5,$6,$7,$8)`,
        [
          id,
          tenantId,
          spec.name,
          spec.unit,
          spec.formulaAlias ?? null,
          spec.formula ?? null,
          spec.criticalLow ?? null,
          spec.criticalHigh ?? null
        ]
      );
      paramIds[spec.name] = id;
      return id;
    };

    const upsertTest = async (departmentId: string, spec: TestSpec): Promise<string> => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO tests (id, tenant_id, department_id, name, code, price_minor, b2b_price_minor, sample_type, tube_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_id, department_id, name) DO UPDATE SET
           code = EXCLUDED.code,
           price_minor = EXCLUDED.price_minor,
           b2b_price_minor = EXCLUDED.b2b_price_minor,
           sample_type = EXCLUDED.sample_type,
           tube_color = EXCLUDED.tube_color,
           updated_at = NOW()`,
        [
          id,
          tenantId,
          departmentId,
          spec.name,
          spec.code,
          spec.priceMinor,
          spec.b2bPriceMinor,
          spec.sampleType ?? "BLOOD",
          spec.tubeColor ?? "PURPLE"
        ]
      );
      const row = (
        await client.query(`SELECT id FROM tests WHERE tenant_id = $1 AND code = $2 LIMIT 1`, [tenantId, spec.code])
      ).rows[0] as { id: string };
      testIds[spec.code] = row.id;
      return row.id;
    };

    for (const testSpec of PRODUCTION_TESTS) {
      const depId = await upsertDepartment(testSpec.department);
      const testId = await upsertTest(depId, testSpec);
      testIds[testSpec.code] = testId;
      for (const param of testSpec.parameters) {
        const paramId = await upsertParameter(param);
        await client.query(
          `INSERT INTO test_parameter_assignments (id, tenant_id, test_id, parameter_id, sort_index)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (tenant_id, test_id, parameter_id) DO UPDATE SET sort_index = EXCLUDED.sort_index`,
          [randomUUID(), tenantId, testId, paramId, param.sort]
        );
        for (const range of param.ranges ?? []) {
          await client.query(
            `INSERT INTO parameter_normal_ranges (id, tenant_id, parameter_id, gender, age_min, age_max, normal_min, normal_max)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (tenant_id, parameter_id, gender, age_min, age_max) DO UPDATE SET
               normal_min = EXCLUDED.normal_min, normal_max = EXCLUDED.normal_max`,
            [randomUUID(), tenantId, paramId, range.gender, range.ageMin, range.ageMax, range.normalMin, range.normalMax]
          );
        }
      }
      seedLog.step(testSpec.name, `${testSpec.code} · ₹${testSpec.priceMinor / 100}`);
    }

    await client.query(
      `INSERT INTO test_packages (id, tenant_id, name, code, price_minor)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, name) DO UPDATE SET code = EXCLUDED.code, price_minor = EXCLUDED.price_minor`,
      [pkg001Id, tenantId, "Master Health Checkup Package", "PKG001", 250000]
    );
    await client.query(
      `INSERT INTO test_packages (id, tenant_id, name, code, price_minor)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, name) DO UPDATE SET code = EXCLUDED.code, price_minor = EXCLUDED.price_minor`,
      [pkg002Id, tenantId, "Executive Cardiac & Diabetes Panel", "PKG002", 160000]
    );

    const resolvedPkg001 = (
      await client.query(`SELECT id FROM test_packages WHERE tenant_id = $1 AND code = 'PKG001' LIMIT 1`, [tenantId])
    ).rows[0] as { id: string };
    const resolvedPkg002 = (
      await client.query(`SELECT id FROM test_packages WHERE tenant_id = $1 AND code = 'PKG002' LIMIT 1`, [tenantId])
    ).rows[0] as { id: string };

    const pkg1Tests = ["CBC001", "KFT001", "LFT001", "LIPID001", "HBA1C001"];
    for (const code of pkg1Tests) {
      await client.query(
        `INSERT INTO test_package_items (id, tenant_id, package_id, test_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, package_id, test_id) DO NOTHING`,
        [randomUUID(), tenantId, resolvedPkg001.id, testIds[code]]
      );
    }
    for (const code of ["LIPID001", "HBA1C001", "KFT001"]) {
      await client.query(
        `INSERT INTO test_package_items (id, tenant_id, package_id, test_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, package_id, test_id) DO NOTHING`,
        [randomUUID(), tenantId, resolvedPkg002.id, testIds[code]]
      );
    }

    await client.query(
      `INSERT INTO report_templates (id, tenant_id, template_type, name, show_reference_range, auto_bold_abnormal, group_by_test)
       VALUES ($1,$2,'STANDARD',$3,TRUE,TRUE,TRUE)
       ON CONFLICT (tenant_id, template_type) DO UPDATE SET name = EXCLUDED.name`,
      [randomUUID(), tenantId, `${tenantId === APOLLO_TENANT_ID ? "Apollo" : "Lab"} Standard Report`]
    );
  });

  seedLog.count("Test", PRODUCTION_TESTS.length);
  seedLog.count("Package", 2);
  return {
    testIds,
    paramIds,
    departmentIds,
    packageIds: { pkg001: pkg001Id, pkg002: pkg002Id }
  };
};
