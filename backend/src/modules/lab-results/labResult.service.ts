import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { aliasFromParameterName, evaluateFormula } from "./formula.engine";
import {
  BatchVerifyInput,
  DeltaCheck,
  LabResultEntryDto,
  LabResultStatus,
  PathologistProfile,
  PendingLabResultRow,
  RerunInput,
  SaveDraftInput
} from "./labResult.types";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const formatRange = (min: number | null, max: number | null): string => {
  if (min == null && max == null) return "—";
  if (min != null && max == null) return `>= ${min}`;
  if (min == null && max != null) return `<= ${max}`;
  return `${min} - ${max}`;
};

const ageMatches = (ageYears: number, ageMin: number | null, ageMax: number | null): boolean => {
  if (ageMin != null && ageYears < ageMin) return false;
  if (ageMax != null && ageYears > ageMax) return false;
  return true;
};

type RangeRule = {
  parameterId: string;
  gender: string;
  ageMin: number | null;
  ageMax: number | null;
  normalMin: number | null;
  normalMax: number | null;
};

const chooseBestRule = (
  rules: RangeRule[],
  gender: string | null,
  ageYears: number | null
): RangeRule | null => {
  const age = ageYears ?? 30;
  const matching = rules.filter((r) => {
    const genderOk = r.gender === "ALL" || (gender != null && r.gender === gender);
    if (!genderOk) return false;
    return ageMatches(age, r.ageMin, r.ageMax);
  });
  if (matching.length === 0) return null;
  return matching.sort((a, b) => {
    const ga = a.gender === gender ? 0 : 1;
    const gb = b.gender === gender ? 0 : 1;
    const wa = a.ageMin != null && a.ageMax != null ? a.ageMax - a.ageMin : 999;
    const wb = b.ageMin != null && b.ageMax != null ? b.ageMax - b.ageMin : 999;
    return ga * 1_000_000 + wa - (gb * 1_000_000 + wb);
  })[0] ?? null;
};

const seedFormulaAliases = async (tenantId: string): Promise<void> => {
  // Best-effort: set aliases/formulas for common calculated params
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) = LOWER($3)`,
    [tenantId, "Total_Bilirubin", "Bilirubin Total"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) LIKE '%direct%bilirubin%'`,
    [tenantId, "Direct_Bilirubin"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2),
       formula = COALESCE(formula, 'Total_Bilirubin - Direct_Bilirubin')
     WHERE tenant_id = $1 AND LOWER(name) LIKE '%indirect%bilirubin%'`,
    [tenantId, "Indirect_Bilirubin"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) = 'albumin'`,
    [tenantId, "Albumin"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) LIKE '%total%protein%'`,
    [tenantId, "Total_Protein"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2),
       formula = COALESCE(formula, 'Total_Protein - Albumin')
     WHERE tenant_id = $1 AND LOWER(name) = 'globulin'`,
    [tenantId, "Globulin"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) LIKE '%total%cholesterol%'`,
    [tenantId, "Total_Cholesterol"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) = 'hdl'`,
    [tenantId, "HDL"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2)
     WHERE tenant_id = $1 AND LOWER(name) LIKE 'triglyceride%'`,
    [tenantId, "Triglycerides"]
  );
  await db.query(
    `UPDATE parameters SET formula_alias = COALESCE(NULLIF(formula_alias, ''), $2),
       formula = COALESCE(formula, 'Total_Cholesterol - HDL - (Triglycerides / 5)')
     WHERE tenant_id = $1 AND LOWER(name) = 'ldl'`,
    [tenantId, "LDL"]
  );
};

const ensurePendingLabResults = async (tenantId: string, orderId?: string): Promise<void> => {
  const params: unknown[] = [tenantId];
  let orderFilter = "";
  if (orderId) {
    params.push(orderId);
    orderFilter = " AND o.id = $2";
  }
  const rows = await db.query(
    `SELECT DISTINCT o.id AS order_id, o.patient_id, oi.test_id, t.department_id
     FROM order_bookings o
     JOIN order_items oi ON oi.order_id = o.id AND oi.item_type = 'TEST' AND oi.test_id IS NOT NULL
     JOIN tests t ON t.id = oi.test_id
     JOIN samples s ON s.order_id = o.id AND s.status IN ('COLLECTED', 'IN_TRANSIT', 'RECEIVED_IN_LAB')
     WHERE o.tenant_id = $1${orderFilter}
       AND NOT EXISTS (
         SELECT 1 FROM lab_results lr
         WHERE lr.tenant_id = o.tenant_id AND lr.order_id = o.id AND lr.test_id = oi.test_id
       )`,
    params
  );

  for (const row of rows.rows) {
    await db.query(
      `INSERT INTO lab_results (id, tenant_id, order_id, patient_id, test_id, department_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
       ON CONFLICT (tenant_id, order_id, test_id) DO NOTHING`,
      [randomUUID(), tenantId, row.order_id, row.patient_id, row.test_id, row.department_id]
    );
  }
};

const loadHistoricalValues = async (
  tenantId: string,
  patientId: string,
  parameterId: string,
  excludeLabResultId: string
): Promise<number[]> => {
  const result = await db.query(
    `SELECT e.value_numeric
     FROM lab_result_entries e
     JOIN lab_results lr ON lr.id = e.lab_result_id
     WHERE e.tenant_id = $1
       AND lr.patient_id = $2
       AND e.parameter_id = $3
       AND e.value_numeric IS NOT NULL
       AND lr.id <> $4
       AND lr.status IN ('TECHNICIAN_APPROVED', 'PATHOLOGIST_APPROVED', 'PATHOLOGIST_VERIFIED')
     ORDER BY e.updated_at DESC
     LIMIT 3`,
    [tenantId, patientId, parameterId, excludeLabResultId]
  );
  return result.rows.map((r: { value_numeric: string | number }) => Number(r.value_numeric));
};

const computeDelta = (current: number, history: number[]): DeltaCheck | null => {
  if (history.length === 0) return null;
  const previousValue = history[0]!;
  if (previousValue === 0) return null;
  const changePercentage = ((current - previousValue) / Math.abs(previousValue)) * 100;
  if (Math.abs(changePercentage) <= 20) return null;
  return {
    previousValue,
    changePercentage: Math.round(changePercentage * 100) / 100,
    flag: "HIGH_VARIANCE"
  };
};

const enrichAndPersistEntries = async (input: {
  tenantId: string;
  userId: string;
  labResultId: string;
  patientId: string;
  patientGender: string | null;
  patientAgeYears: number | null;
  entries: SaveDraftInput["entries"];
  status: LabResultStatus;
  technicianNote?: string | null;
}): Promise<LabResultEntryDto[]> => {
  const paramsResult = await db.query(
    `SELECT p.id, p.name, p.unit, p.formula, p.formula_alias, p.critical_low, p.critical_high
     FROM lab_result_entries e
     RIGHT JOIN parameters p ON p.id = e.parameter_id
     WHERE p.tenant_id = $1 AND (
       e.lab_result_id = $2 OR p.id = ANY($3::uuid[])
     )`,
    [input.tenantId, input.labResultId, input.entries.map((e) => e.parameterId)]
  );

  // Load all parameters for this lab result's test
  const testParams = await db.query(
    `SELECT p.id, p.name, p.unit, p.formula, COALESCE(NULLIF(p.formula_alias, ''), $3) AS formula_alias,
            p.critical_low, p.critical_high
     FROM lab_results lr
     JOIN test_parameter_assignments a ON a.test_id = lr.test_id AND a.tenant_id = lr.tenant_id
     JOIN parameters p ON p.id = a.parameter_id
     WHERE lr.tenant_id = $1 AND lr.id = $2
     ORDER BY a.sort_index ASC, p.name ASC`,
    [input.tenantId, input.labResultId, ""]
  );

  const parameterMeta = testParams.rows.map((r: any) => ({
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as string | null,
    formula: r.formula as string | null,
    formulaAlias: (r.formula_alias as string) || aliasFromParameterName(r.name as string),
    criticalLow: r.critical_low == null ? null : Number(r.critical_low),
    criticalHigh: r.critical_high == null ? null : Number(r.critical_high)
  }));

  const valueByParamId = new Map<string, number | null>();
  const textByParamId = new Map<string, string | null>();
  const ackByParamId = new Map<string, string | null>();
  for (const e of input.entries) {
    valueByParamId.set(e.parameterId, e.value ?? null);
    textByParamId.set(e.parameterId, e.valueText ?? null);
    ackByParamId.set(e.parameterId, e.criticalAckNote ?? null);
  }

  // Alias map for formulas
  const aliasValues: Record<string, number> = {};
  for (const p of parameterMeta) {
    const v = valueByParamId.get(p.id);
    if (v != null && Number.isFinite(v)) {
      aliasValues[p.formulaAlias] = v;
    }
  }

  // Apply formulas for calculated parameters
  for (const p of parameterMeta) {
    if (!p.formula) continue;
    const calculated = evaluateFormula(p.formula, aliasValues);
    if (calculated != null) {
      valueByParamId.set(p.id, Math.round(calculated * 1000) / 1000);
      aliasValues[p.formulaAlias] = valueByParamId.get(p.id)!;
    }
  }

  const rangesResult = await db.query(
    `SELECT parameter_id, gender, age_min, age_max, normal_min, normal_max
     FROM parameter_normal_ranges
     WHERE tenant_id = $1 AND parameter_id = ANY($2::uuid[])`,
    [input.tenantId, parameterMeta.map((p) => p.id)]
  );
  const allRules: RangeRule[] = rangesResult.rows.map((r: any) => ({
    parameterId: r.parameter_id,
    gender: r.gender,
    ageMin: r.age_min,
    ageMax: r.age_max,
    normalMin: r.normal_min == null ? null : Number(r.normal_min),
    normalMax: r.normal_max == null ? null : Number(r.normal_max)
  }));

  const out: LabResultEntryDto[] = [];

  for (const p of parameterMeta) {
    const numeric = valueByParamId.get(p.id) ?? null;
    const best = chooseBestRule(
      allRules.filter((r) => r.parameterId === p.id),
      input.patientGender,
      input.patientAgeYears
    );
    const referenceMin = best?.normalMin ?? null;
    const referenceMax = best?.normalMax ?? null;

    let isAbnormal = false;
    let flag: "H" | "L" | "CRITICAL" | null = null;
    if (numeric != null) {
      if (referenceMin != null && numeric < referenceMin) {
        isAbnormal = true;
        flag = "L";
      }
      if (referenceMax != null && numeric > referenceMax) {
        isAbnormal = true;
        flag = "H";
      }
    }

    let isCritical = false;
    if (numeric != null) {
      if (p.criticalLow != null && numeric < p.criticalLow) {
        isCritical = true;
        flag = "CRITICAL";
      }
      if (p.criticalHigh != null && numeric > p.criticalHigh) {
        isCritical = true;
        flag = "CRITICAL";
      }
    }

    // Fallback critical: far outside normal (50% beyond band) if catalog criticals not set
    if (numeric != null && !isCritical && referenceMin != null && referenceMax != null) {
      const span = Math.abs(referenceMax - referenceMin) || Math.abs(referenceMax);
      if (numeric < referenceMin - span * 0.5 || numeric > referenceMax + span * 0.5) {
        isCritical = true;
        flag = "CRITICAL";
      }
    }

    const history = numeric != null ? await loadHistoricalValues(input.tenantId, input.patientId, p.id, input.labResultId) : [];
    const deltaCheck = numeric != null ? computeDelta(numeric, history) : null;

    const entryId = randomUUID();
    const existing = await db.query(
      `SELECT id FROM lab_result_entries WHERE tenant_id = $1 AND lab_result_id = $2 AND parameter_id = $3 LIMIT 1`,
      [input.tenantId, input.labResultId, p.id]
    );
    const id = (existing.rows[0]?.id as string | undefined) ?? entryId;

    await db.query(
      `INSERT INTO lab_result_entries
       (id, tenant_id, lab_result_id, parameter_id, value_numeric, value_text, is_calculated,
        is_abnormal, is_critical, flag, reference_min, reference_max,
        delta_previous_value, delta_change_percentage, delta_flag, critical_ack_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (tenant_id, lab_result_id, parameter_id) DO UPDATE SET
         value_numeric = EXCLUDED.value_numeric,
         value_text = EXCLUDED.value_text,
         is_calculated = EXCLUDED.is_calculated,
         is_abnormal = EXCLUDED.is_abnormal,
         is_critical = EXCLUDED.is_critical,
         flag = EXCLUDED.flag,
         reference_min = EXCLUDED.reference_min,
         reference_max = EXCLUDED.reference_max,
         delta_previous_value = EXCLUDED.delta_previous_value,
         delta_change_percentage = EXCLUDED.delta_change_percentage,
         delta_flag = EXCLUDED.delta_flag,
         critical_ack_note = COALESCE(EXCLUDED.critical_ack_note, lab_result_entries.critical_ack_note),
         updated_at = NOW()`,
      [
        id,
        input.tenantId,
        input.labResultId,
        p.id,
        numeric,
        textByParamId.get(p.id) ?? null,
        Boolean(p.formula),
        isAbnormal,
        isCritical,
        flag,
        referenceMin,
        referenceMax,
        deltaCheck?.previousValue ?? null,
        deltaCheck?.changePercentage ?? null,
        deltaCheck?.flag ?? null,
        ackByParamId.get(p.id) ?? null
      ]
    );

    if (isCritical) {
      await db.query(
        `INSERT INTO panic_alerts (id, tenant_id, lab_result_id, parameter_id, value_numeric, message, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          input.tenantId,
          input.labResultId,
          p.id,
          numeric,
          `PANIC: ${p.name} = ${numeric} (critical)`,
          input.userId
        ]
      );
    }

    out.push({
      id,
      parameterId: p.id,
      parameterName: p.name,
      unit: p.unit,
      formulaAlias: p.formulaAlias,
      formula: p.formula,
      methodology: null,
      value: numeric,
      valueText: textByParamId.get(p.id) ?? null,
      isCalculated: Boolean(p.formula),
      isAbnormal,
      isCritical,
      flag,
      referenceMin,
      referenceMax,
      referenceRange: formatRange(referenceMin, referenceMax),
      criticalLow: p.criticalLow,
      criticalHigh: p.criticalHigh,
      deltaCheck,
      criticalAckNote: ackByParamId.get(p.id) ?? null
    });
  }

  void paramsResult;

  await db.query(
    `UPDATE lab_results
     SET status = $3, technician_note = COALESCE($4, technician_note), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, input.labResultId, input.status, input.technicianNote ?? null]
  );

  return out;
};

const mapPendingRow = async (tenantId: string, row: any): Promise<PendingLabResultRow> => {
  const entriesResult = await db.query(
    `SELECT
       e.id AS entry_id,
       p.id AS parameter_id,
       p.name AS parameter_name,
       p.unit,
       p.formula,
       COALESCE(NULLIF(p.formula_alias, ''), '') AS formula_alias,
       p.critical_low,
       p.critical_high,
       p.methodology,
       e.value_numeric,
       e.value_text,
       e.is_calculated,
       e.is_abnormal,
       e.is_critical,
       e.flag,
       e.reference_min,
       e.reference_max,
       e.delta_previous_value,
       e.delta_change_percentage,
       e.delta_flag,
       e.critical_ack_note
     FROM lab_results lr
     JOIN test_parameter_assignments a ON a.test_id = lr.test_id AND a.tenant_id = lr.tenant_id
     JOIN parameters p ON p.id = a.parameter_id
     LEFT JOIN lab_result_entries e ON e.lab_result_id = lr.id AND e.parameter_id = p.id AND e.tenant_id = lr.tenant_id
     WHERE lr.tenant_id = $1 AND lr.id = $2
     ORDER BY a.sort_index ASC, p.name ASC`,
    [tenantId, row.id]
  );

  const entries: LabResultEntryDto[] = entriesResult.rows.map((e: any) => {
    const alias = (e.formula_alias as string) || aliasFromParameterName(e.parameter_name as string);
    const referenceMin = e.reference_min == null ? null : Number(e.reference_min);
    const referenceMax = e.reference_max == null ? null : Number(e.reference_max);
    const deltaCheck: DeltaCheck | null =
      e.delta_flag === "HIGH_VARIANCE" && e.delta_previous_value != null
        ? {
            previousValue: Number(e.delta_previous_value),
            changePercentage: Number(e.delta_change_percentage),
            flag: "HIGH_VARIANCE"
          }
        : null;
    return {
      id: (e.entry_id as string | null) ?? `draft:${row.id}:${e.parameter_id}`,
      parameterId: e.parameter_id,
      parameterName: e.parameter_name,
      unit: e.unit,
      formulaAlias: alias,
      formula: e.formula,
      methodology: e.methodology ?? "CLIA / Photometry",
      value: e.value_numeric == null ? null : Number(e.value_numeric),
      valueText: e.value_text,
      isCalculated: Boolean(e.is_calculated ?? e.formula),
      isAbnormal: Boolean(e.is_abnormal),
      isCritical: Boolean(e.is_critical),
      flag: (e.flag as "H" | "L" | "CRITICAL" | null) ?? null,
      referenceMin,
      referenceMax,
      referenceRange: formatRange(referenceMin, referenceMax),
      criticalLow: e.critical_low == null ? null : Number(e.critical_low),
      criticalHigh: e.critical_high == null ? null : Number(e.critical_high),
      deltaCheck,
      criticalAckNote: e.critical_ack_note
    };
  });

  return {
    labResultId: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientUhid: row.patient_uhid,
    patientPhone: row.patient_phone ?? null,
    patientGender: row.patient_gender,
    patientAgeYears: row.patient_age_years != null ? Number(row.patient_age_years) : null,
    testId: row.test_id,
    testName: row.test_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    status: row.status,
    technicianNote: row.technician_note,
    referredDoctor: row.referred_doctor ?? null,
    sampleCollectedAt: row.sample_collected_at ? new Date(row.sample_collected_at).toISOString() : null,
    sampleReceivedAt: row.sample_received_at ? new Date(row.sample_received_at).toISOString() : null,
    entries
  };
};

const pendingSelectSql = `SELECT lr.*, o.order_number,
              p.name AS patient_name, COALESCE(p.uhid, p.patient_code) AS patient_uhid, p.phone AS patient_phone,
              p.gender AS patient_gender,
              CASE
                WHEN p.date_of_birth IS NOT NULL THEN (CURRENT_DATE - p.date_of_birth)::numeric / 365.25
                WHEN p.age_days IS NOT NULL THEN p.age_days::numeric / 365.25
                ELSE p.age_years::numeric
              END AS patient_age_years,
              t.name AS test_name, d.name AS department_name,
              (SELECT MIN(s.collected_at) FROM samples s WHERE s.order_id = o.id AND s.tenant_id = o.tenant_id) AS sample_collected_at,
              (SELECT MIN(s.received_at) FROM samples s WHERE s.order_id = o.id AND s.tenant_id = o.tenant_id) AS sample_received_at`;

export const labResultService = {
  async listPending(
    tenantId: string,
    filters: { department?: string; orderId?: string }
  ): Promise<PendingLabResultRow[]> {
    ensurePg();
    await seedFormulaAliases(tenantId);
    await ensurePendingLabResults(tenantId);

    const params: unknown[] = [tenantId];
    let where = `lr.tenant_id = $1 AND lr.status IN ('PENDING', 'PROCESSING', 'DRAFT')`;
    if (filters.orderId) {
      params.push(filters.orderId);
      where += ` AND lr.order_id = $${params.length}`;
    }
    if (filters.department) {
      params.push(filters.department);
      where += ` AND (d.name ILIKE $${params.length} OR d.id::text = $${params.length})`;
    }

    const result = await db.query(
      `${pendingSelectSql}
       FROM lab_results lr
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN tests t ON t.id = lr.test_id
       JOIN departments d ON d.id = lr.department_id
       WHERE ${where}
       ORDER BY lr.updated_at DESC
       LIMIT 100`,
      params
    );

    const out: PendingLabResultRow[] = [];
    for (const row of result.rows) {
      out.push(await mapPendingRow(tenantId, row));
    }
    return out;
  },

  async saveDraft(tenantId: string, userId: string, input: SaveDraftInput): Promise<PendingLabResultRow> {
    ensurePg();
    const lr = await db.query(
      `SELECT lr.*, p.gender AS patient_gender,
              CASE
                WHEN p.date_of_birth IS NOT NULL THEN (CURRENT_DATE - p.date_of_birth)::numeric / 365.25
                WHEN p.age_days IS NOT NULL THEN p.age_days::numeric / 365.25
                ELSE p.age_years::numeric
              END AS patient_age_years
       FROM lab_results lr
       JOIN patients p ON p.id = lr.patient_id
       WHERE lr.tenant_id = $1 AND lr.id = $2 LIMIT 1`,
      [tenantId, input.labResultId]
    );
    const row = lr.rows[0];
    if (!row) {
      throw new AppError("Lab result not found", HTTP_STATUS.NOT_FOUND, "LAB_RESULT_NOT_FOUND");
    }
    if (row.status === "TECHNICIAN_APPROVED" || row.status === "PATHOLOGIST_APPROVED" || row.status === "PATHOLOGIST_VERIFIED") {
      throw new AppError("Result already approved", HTTP_STATUS.CONFLICT, "ALREADY_APPROVED");
    }

    // First entry into work: PENDING → PROCESSING and auto-deduct reagent lot
    if (row.status === "PENDING") {
      await db.query(
        `UPDATE lab_results SET status = 'PROCESSING', updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.labResultId]
      );
      const { reagentService } = await import("../inventory/reagent.service");
      await reagentService.deductForLabResult(tenantId, input.labResultId, row.test_id);
    }

    // Ensure critical acks when critical
    await enrichAndPersistEntries({
      tenantId,
      userId,
      labResultId: input.labResultId,
      patientId: row.patient_id,
      patientGender: row.patient_gender,
      patientAgeYears: row.patient_age_years != null ? Number(row.patient_age_years) : null,
      entries: input.entries,
      status: "DRAFT",
      technicianNote: input.technicianNote ?? null
    });

    const pending = await this.listPending(tenantId, { orderId: row.order_id });
    const matched = pending.find((p) => p.labResultId === input.labResultId);
    if (!matched) {
      throw new AppError("Failed to reload lab result", HTTP_STATUS.INTERNAL_SERVER_ERROR, "RELOAD_FAILED");
    }
    return matched;
  },

  async technicianApprove(tenantId: string, userId: string, input: SaveDraftInput): Promise<PendingLabResultRow> {
    ensurePg();
    const draft = await this.saveDraft(tenantId, userId, input);

    const criticalWithoutAck = draft.entries.filter((e) => e.isCritical && !e.criticalAckNote?.trim());
    if (criticalWithoutAck.length > 0) {
      throw new AppError(
        `Critical values require acknowledgment: ${criticalWithoutAck.map((e) => e.parameterName).join(", ")}`,
        HTTP_STATUS.BAD_REQUEST,
        "CRITICAL_ACK_REQUIRED"
      );
    }

    await db.query(
      `UPDATE lab_results
       SET status = 'TECHNICIAN_APPROVED', approved_by_user_id = $3, approved_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.labResultId, userId]
    );

    // Ensure reagent consumption even if PROCESSING deduct was skipped
    const { reagentService } = await import("../inventory/reagent.service");
    const lrRow = (
      await db.query(`SELECT test_id FROM lab_results WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        input.labResultId
      ])
    ).rows[0];
    if (lrRow?.test_id) {
      await reagentService.deductForLabResult(tenantId, input.labResultId, lrRow.test_id);
    }

    const refreshed = await db.query(
      `${pendingSelectSql}
       FROM lab_results lr
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN tests t ON t.id = lr.test_id
       JOIN departments d ON d.id = lr.department_id
       WHERE lr.tenant_id = $1 AND lr.id = $2`,
      [tenantId, input.labResultId]
    );
    return mapPendingRow(tenantId, refreshed.rows[0]);
  },

  async listPathologistQueue(tenantId: string): Promise<PendingLabResultRow[]> {
    ensurePg();
    const result = await db.query(
      `${pendingSelectSql}
       FROM lab_results lr
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN tests t ON t.id = lr.test_id
       JOIN departments d ON d.id = lr.department_id
       WHERE lr.tenant_id = $1 AND lr.status = 'TECHNICIAN_APPROVED'
       ORDER BY lr.approved_at DESC NULLS LAST
       LIMIT 100`,
      [tenantId]
    );
    const out: PendingLabResultRow[] = [];
    for (const row of result.rows) {
      out.push(await mapPendingRow(tenantId, row));
    }
    return out;
  },

  async getById(tenantId: string, labResultId: string): Promise<PendingLabResultRow | null> {
    ensurePg();
    const result = await db.query(
      `${pendingSelectSql}
       FROM lab_results lr
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN tests t ON t.id = lr.test_id
       JOIN departments d ON d.id = lr.department_id
       WHERE lr.tenant_id = $1 AND lr.id = $2
       LIMIT 1`,
      [tenantId, labResultId]
    );
    if (!result.rows[0]) return null;
    return mapPendingRow(tenantId, result.rows[0]);
  },

  async listVerifiedForOrder(tenantId: string, orderId: string): Promise<PendingLabResultRow[]> {
    ensurePg();
    const result = await db.query(
      `${pendingSelectSql}
       FROM lab_results lr
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN tests t ON t.id = lr.test_id
       JOIN departments d ON d.id = lr.department_id
       WHERE lr.tenant_id = $1 AND lr.order_id = $2 AND lr.status = 'PATHOLOGIST_VERIFIED'
       ORDER BY lr.verified_at ASC NULLS LAST`,
      [tenantId, orderId]
    );
    const out: PendingLabResultRow[] = [];
    for (const row of result.rows) {
      out.push(await mapPendingRow(tenantId, row));
    }
    return out;
  },

  async getPathologistProfile(tenantId: string, userId: string): Promise<PathologistProfile> {
    ensurePg();
    const result = await db.query(
      `SELECT user_id, full_name, medical_license_number, digital_signature_url
       FROM pathologist_profiles WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [tenantId, userId]
    );
    if (result.rows[0]) {
      return {
        userId: result.rows[0].user_id,
        fullName: result.rows[0].full_name,
        medicalLicenseNumber: result.rows[0].medical_license_number,
        digitalSignatureUrl: result.rows[0].digital_signature_url
      };
    }
    return {
      userId,
      fullName: "Pathologist",
      medicalLicenseNumber: "MCI-000000",
      digitalSignatureUrl: null
    };
  },

  async upsertPathologistProfile(
    tenantId: string,
    userId: string,
    input: { fullName: string; medicalLicenseNumber: string; digitalSignatureUrl?: string | null }
  ): Promise<PathologistProfile> {
    ensurePg();
    await db.query(
      `INSERT INTO pathologist_profiles (user_id, tenant_id, full_name, medical_license_number, digital_signature_url)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         medical_license_number = EXCLUDED.medical_license_number,
         digital_signature_url = EXCLUDED.digital_signature_url,
         updated_at = NOW()`,
      [userId, tenantId, input.fullName, input.medicalLicenseNumber, input.digitalSignatureUrl ?? null]
    );
    return this.getPathologistProfile(tenantId, userId);
  },

  async batchVerify(
    tenantId: string,
    userId: string,
    input: BatchVerifyInput
  ): Promise<{ verified: PendingLabResultRow[]; profile: PathologistProfile }> {
    ensurePg();
    if (!input.labResultIds?.length) {
      throw new AppError("labResultIds required", HTTP_STATUS.BAD_REQUEST, "IDS_REQUIRED");
    }

    const { qcService } = await import("../inventory/qc.service");
    await qcService.assertVerificationAllowed(tenantId, input.labResultIds);

    const profile = await this.getPathologistProfile(tenantId, userId);
    const signatureUrl = input.digitalSignatureUrl ?? profile.digitalSignatureUrl;
    const license = input.medicalLicenseNumber ?? profile.medicalLicenseNumber;
    const name = input.pathologistName ?? profile.fullName;

    const verified: PendingLabResultRow[] = [];
    for (const id of input.labResultIds) {
      const existing = await db.query(
        `SELECT status FROM lab_results WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!existing.rows[0]) {
        throw new AppError(`Lab result not found: ${id}`, HTTP_STATUS.NOT_FOUND, "LAB_RESULT_NOT_FOUND");
      }
      if (existing.rows[0].status !== "TECHNICIAN_APPROVED") {
        throw new AppError(`Result ${id} is not TECHNICIAN_APPROVED`, HTTP_STATUS.CONFLICT, "INVALID_STATUS");
      }
      await db.query(
        `UPDATE lab_results
         SET status = 'PATHOLOGIST_VERIFIED',
             pathologist_user_id = $3,
             pathologist_signature_url = $4,
             pathologist_license = $5,
             pathologist_name = $6,
             verified_at = NOW(),
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, userId, signatureUrl, license, name]
      );
      const refreshed = await db.query(
        `${pendingSelectSql}
         FROM lab_results lr
         JOIN order_bookings o ON o.id = lr.order_id
         JOIN patients p ON p.id = lr.patient_id
         JOIN tests t ON t.id = lr.test_id
         JOIN departments d ON d.id = lr.department_id
         WHERE lr.tenant_id = $1 AND lr.id = $2`,
        [tenantId, id]
      );
      verified.push(await mapPendingRow(tenantId, refreshed.rows[0]));
    }
    return { verified, profile: { ...profile, digitalSignatureUrl: signatureUrl, medicalLicenseNumber: license, fullName: name } };
  },

  async requestRerun(tenantId: string, userId: string, input: RerunInput): Promise<PendingLabResultRow> {
    ensurePg();
    if (!input.instructions?.trim()) {
      throw new AppError("instructions required", HTTP_STATUS.BAD_REQUEST, "INSTRUCTIONS_REQUIRED");
    }
    const existing = await db.query(`SELECT status FROM lab_results WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [
      tenantId,
      input.labResultId
    ]);
    if (!existing.rows[0]) {
      throw new AppError("Lab result not found", HTTP_STATUS.NOT_FOUND, "LAB_RESULT_NOT_FOUND");
    }
    if (existing.rows[0].status !== "TECHNICIAN_APPROVED" && existing.rows[0].status !== "DRAFT") {
      throw new AppError("Only technician-approved/draft results can be sent for rerun", HTTP_STATUS.CONFLICT, "INVALID_STATUS");
    }
    await db.query(
      `UPDATE lab_results
       SET status = 'DRAFT',
           rerun_instructions = $3,
           pathologist_user_id = $4,
           technician_note = TRIM(BOTH E'\n' FROM CONCAT(COALESCE(technician_note, ''), E'\n[RERUN] ', $3)),
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.labResultId, input.instructions.trim(), userId]
    );
    const refreshed = await db.query(
      `${pendingSelectSql}
       FROM lab_results lr
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN tests t ON t.id = lr.test_id
       JOIN departments d ON d.id = lr.department_id
       WHERE lr.tenant_id = $1 AND lr.id = $2`,
      [tenantId, input.labResultId]
    );
    return mapPendingRow(tenantId, refreshed.rows[0]);
  },

  /** Create pending results and promote to PROCESSING with reagent deduction (rapid-scan / receive). */
  async activateProcessingForOrder(tenantId: string, orderId: string, userId: string): Promise<number> {
    ensurePg();
    await ensurePendingLabResults(tenantId, orderId);
    const pending = await db.query(
      `SELECT id, test_id FROM lab_results
       WHERE tenant_id = $1 AND order_id = $2 AND status = 'PENDING'`,
      [tenantId, orderId]
    );
    const { reagentService } = await import("../inventory/reagent.service");
    let activated = 0;
    for (const row of pending.rows) {
      await db.query(
        `UPDATE lab_results SET status = 'PROCESSING', updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, row.id]
      );
      await reagentService.deductForLabResult(tenantId, row.id, row.test_id);
      activated += 1;
    }
    if (activated > 0) {
      const { emitLabResultQueueUpdate } = await import("../../realtime/sampleEvents");
      emitLabResultQueueUpdate(tenantId, { orderId, activatedBy: userId, count: activated });
    }
    return activated;
  }
};
