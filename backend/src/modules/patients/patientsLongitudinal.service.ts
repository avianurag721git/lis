import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { patientsRepository } from "./patients.repository";

export type LongitudinalDataPoint = {
  date: string;
  value: number | null;
  valueText: string | null;
  orderId: string;
  orderNumber: string;
  testId: string;
  testName: string;
  referenceMin: number | null;
  referenceMax: number | null;
  isAbnormal: boolean;
  flag: string | null;
};

export type LongitudinalParameterSeries = {
  parameterId: string;
  parameterName: string;
  unit: string | null;
  referenceMin: number | null;
  referenceMax: number | null;
  dataPoints: LongitudinalDataPoint[];
};

export type LongitudinalHistory = {
  patient: {
    id: string;
    name: string;
    gender: string | null;
    ageYears: number | null;
  };
  parameters: LongitudinalParameterSeries[];
};

const VERIFIED_STATUSES = [
  "TECHNICIAN_APPROVED",
  "PATHOLOGIST_APPROVED",
  "PATHOLOGIST_VERIFIED"
] as const;

const ageMatches = (ageYears: number, ageMin: number | null, ageMax: number | null): boolean => {
  if (ageMin != null && ageYears < ageMin) return false;
  if (ageMax != null && ageYears > ageMax) return false;
  return true;
};

const chooseBestRule = (
  rules: Array<{
    gender: string;
    ageMin: number | null;
    ageMax: number | null;
    normalMin: number | null;
    normalMax: number | null;
  }>,
  patientGender: string,
  patientAgeYears: number
): { normalMin: number | null; normalMax: number | null } | null => {
  const matching = rules.filter((r) => {
    const genderOk = r.gender === "ALL" || r.gender === patientGender;
    if (!genderOk) return false;
    return ageMatches(patientAgeYears, r.ageMin, r.ageMax);
  });
  if (matching.length === 0) return null;

  const score = (r: (typeof rules)[number]): number => {
    const genderScore = r.gender === patientGender ? 0 : 1;
    const bandWidth =
      r.ageMin != null && r.ageMax != null ? Math.max(0, r.ageMax - r.ageMin) : Number.POSITIVE_INFINITY;
    return genderScore * 1_000_000 + bandWidth;
  };

  const best = matching.sort((a, b) => score(a) - score(b))[0];
  if (!best) return null;
  return { normalMin: best.normalMin, normalMax: best.normalMax };
};

export const patientsLongitudinalService = {
  async getHistory(tenantId: string, patientId: string): Promise<LongitudinalHistory> {
    if (!env.databaseUrl) {
      throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
    }

    const patient = await patientsRepository.getById(tenantId, patientId, false);
    if (!patient) {
      throw new AppError("Patient not found", HTTP_STATUS.NOT_FOUND, "PATIENT_NOT_FOUND");
    }

    const patientGender = patient.gender ?? "OTHER";
    const patientAge = patient.ageDays != null ? patient.ageDays / 365.25 : (patient.ageYears ?? 30);

    const rows = await db.query(
      `SELECT
         p.id AS parameter_id,
         p.name AS parameter_name,
         p.unit,
         e.value_numeric,
         e.value_text,
         e.reference_min,
         e.reference_max,
         e.is_abnormal,
         e.flag,
         lr.order_id,
         o.order_number,
         lr.test_id,
         t.name AS test_name,
         COALESCE(lr.verified_at, lr.approved_at, e.updated_at, lr.updated_at) AS result_date
       FROM lab_result_entries e
       JOIN lab_results lr ON lr.id = e.lab_result_id AND lr.tenant_id = e.tenant_id
       JOIN parameters p ON p.id = e.parameter_id
       JOIN order_bookings o ON o.id = lr.order_id AND o.tenant_id = lr.tenant_id
       JOIN tests t ON t.id = lr.test_id
       WHERE e.tenant_id = $1
         AND lr.patient_id = $2
         AND lr.status = ANY($3::text[])
         AND (e.value_numeric IS NOT NULL OR e.value_text IS NOT NULL)
       ORDER BY p.name ASC, result_date ASC`,
      [tenantId, patientId, VERIFIED_STATUSES]
    );

    const rangeRows = await db.query(
      `SELECT parameter_id, gender, age_min, age_max, normal_min, normal_max
       FROM parameter_normal_ranges
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const rangesByParam = new Map<
      string,
      Array<{
        gender: string;
        ageMin: number | null;
        ageMax: number | null;
        normalMin: number | null;
        normalMax: number | null;
      }>
    >();

    for (const r of rangeRows.rows) {
      const pid = r.parameter_id as string;
      const list = rangesByParam.get(pid) ?? [];
      list.push({
        gender: r.gender as string,
        ageMin: r.age_min as number | null,
        ageMax: r.age_max as number | null,
        normalMin: r.normal_min == null ? null : Number(r.normal_min),
        normalMax: r.normal_max == null ? null : Number(r.normal_max)
      });
      rangesByParam.set(pid, list);
    }

    const byParameter = new Map<string, LongitudinalParameterSeries>();

    for (const row of rows.rows) {
      const parameterId = row.parameter_id as string;
      let series = byParameter.get(parameterId);
      if (!series) {
        const rules = rangesByParam.get(parameterId) ?? [];
        const band = chooseBestRule(rules, patientGender, patientAge);
        series = {
          parameterId,
          parameterName: row.parameter_name as string,
          unit: (row.unit as string | null) ?? null,
          referenceMin: band?.normalMin ?? null,
          referenceMax: band?.normalMax ?? null,
          dataPoints: []
        };
        byParameter.set(parameterId, series);
      }

      series.dataPoints.push({
        date: new Date(row.result_date as string).toISOString(),
        value: row.value_numeric == null ? null : Number(row.value_numeric),
        valueText: (row.value_text as string | null) ?? null,
        orderId: row.order_id as string,
        orderNumber: row.order_number as string,
        testId: row.test_id as string,
        testName: row.test_name as string,
        referenceMin: row.reference_min == null ? null : Number(row.reference_min),
        referenceMax: row.reference_max == null ? null : Number(row.reference_max),
        isAbnormal: Boolean(row.is_abnormal),
        flag: (row.flag as string | null) ?? null
      });
    }

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        gender: patient.gender,
        ageYears: patient.ageYears
      },
      parameters: [...byParameter.values()].filter((s) => s.dataPoints.some((d) => d.value != null))
    };
  }
};
