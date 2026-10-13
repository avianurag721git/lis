export const AGE_UNITS = ["DAYS", "MONTHS", "YEARS"] as const;
export type AgeUnit = (typeof AGE_UNITS)[number];

export type PatientAgeInput = {
  dateOfBirth?: string | null;
  ageValue?: number | null;
  ageUnit?: AgeUnit | null;
  ageYears?: number | null;
};

export type ResolvedPatientAge = {
  dateOfBirth: string | null;
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  ageDays: number | null;
  ageYears: number | null;
  ageDisplay: string | null;
  ageCompact: string | null;
};

const DAYS_PER_YEAR = 365.25;
const DAYS_PER_MONTH = 30.4375;
const NEONATE_DAYS = 28;
const INFANT_DAYS = 730;

const pad = (n: number): string => String(n).padStart(2, "0");

export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseIsoDate = (raw: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
};

const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const daysBetweenUtc = (from: Date, to: Date): number => {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  return Math.floor((b - a) / 86_400_000);
};

const unitMax = (unit: AgeUnit): number => {
  if (unit === "DAYS") return 43800;
  if (unit === "MONTHS") return 1440;
  return 120;
};

export const ageDaysFromUnit = (value: number, unit: AgeUnit): number => {
  if (unit === "DAYS") return value;
  if (unit === "MONTHS") return Math.round(value * DAYS_PER_MONTH);
  return Math.round(value * DAYS_PER_YEAR);
};

/** AAP / LIS display: days for neonates, months for infants, years thereafter. */
export const displayPartsFromAgeDays = (ageDays: number): { value: number; unit: AgeUnit } => {
  if (ageDays < NEONATE_DAYS) return { value: Math.max(0, ageDays), unit: "DAYS" };
  if (ageDays < INFANT_DAYS) return { value: Math.max(1, Math.round(ageDays / DAYS_PER_MONTH)), unit: "MONTHS" };
  return { value: Math.max(1, Math.floor(ageDays / DAYS_PER_YEAR)), unit: "YEARS" };
};

const unitLabel = (value: number, unit: AgeUnit, compact: boolean): string => {
  if (compact) {
    if (unit === "DAYS") return `${value}D`;
    if (unit === "MONTHS") return `${value}M`;
    return `${value}Y`;
  }
  if (unit === "DAYS") return value === 1 ? "1 day" : `${value} days`;
  if (unit === "MONTHS") return value === 1 ? "1 month" : `${value} months`;
  return value === 1 ? "1 year" : `${value} years`;
};

export const formatAgeFromDays = (ageDays: number | null | undefined, compact = false): string | null => {
  if (ageDays == null || ageDays < 0 || !Number.isFinite(ageDays)) return null;
  const parts = displayPartsFromAgeDays(ageDays);
  return unitLabel(parts.value, parts.unit, compact);
};

export const formatAgeRecord = (
  input: {
    dateOfBirth?: string | null;
    ageDays?: number | null;
    ageValue?: number | null;
    ageUnit?: AgeUnit | null;
    ageYears?: number | null;
  },
  opts?: { compact?: boolean; asOf?: Date }
): string | null => {
  const compact = opts?.compact ?? false;
  const resolved = resolvePatientAge(
    {
      dateOfBirth: input.dateOfBirth ?? null,
      ageValue: input.ageValue ?? null,
      ageUnit: input.ageUnit ?? null,
      ageYears: input.ageYears ?? null
    },
    opts?.asOf
  );
  if (resolved.ageDays != null) return formatAgeFromDays(resolved.ageDays, compact);
  return null;
};

export type AgeResolveErrorCode = "INVALID_DOB" | "FUTURE_DOB" | "AGE_TOO_LARGE" | "INVALID_AGE";

const fail = (code: AgeResolveErrorCode, message: string): never => {
  throw Object.assign(new Error(message), { code });
};

export const resolvePatientAge = (input: PatientAgeInput, asOf: Date = new Date()): ResolvedPatientAge => {
  const empty: ResolvedPatientAge = {
    dateOfBirth: null,
    ageValue: null,
    ageUnit: null,
    ageDays: null,
    ageYears: null,
    ageDisplay: null,
    ageCompact: null
  };

  const dobRaw = input.dateOfBirth?.trim() || null;
  if (dobRaw) {
    const dob = parseIsoDate(dobRaw);
    if (!dob) {
      fail("INVALID_DOB", "Date of birth is invalid");
    }
    const days = daysBetweenUtc(dob!, asOf);
    if (days < 0) {
      fail("FUTURE_DOB", "Date of birth cannot be in the future");
    }
    if (days > unitMax("DAYS")) {
      fail("AGE_TOO_LARGE", "Date of birth is out of range");
    }
    const display = displayPartsFromAgeDays(days);
    return {
      dateOfBirth: toIsoDate(dob!),
      ageValue: display.value,
      ageUnit: display.unit,
      ageDays: days,
      ageYears: Math.floor(days / DAYS_PER_YEAR),
      ageDisplay: formatAgeFromDays(days, false),
      ageCompact: formatAgeFromDays(days, true)
    };
  }

  const unit = input.ageUnit ?? (input.ageYears != null && input.ageValue == null ? "YEARS" : null);
  const value = input.ageValue ?? (unit === "YEARS" ? input.ageYears : null);
  if (value == null || unit == null) {
    if (input.ageYears != null) {
      const days = ageDaysFromUnit(input.ageYears, "YEARS");
      return {
        ...empty,
        ageValue: input.ageYears,
        ageUnit: "YEARS",
        ageDays: days,
        ageYears: input.ageYears,
        ageDisplay: formatAgeFromDays(days, false),
        ageCompact: formatAgeFromDays(days, true)
      };
    }
    return empty;
  }

  if (!Number.isInteger(value) || value < 0 || value > unitMax(unit)) {
    fail("INVALID_AGE", "Age is out of range for the selected unit");
  }

  const days = ageDaysFromUnit(value, unit);
  return {
    dateOfBirth: null,
    ageValue: value,
    ageUnit: unit,
    ageDays: days,
    ageYears: Math.floor(days / DAYS_PER_YEAR),
    ageDisplay: formatAgeFromDays(days, false),
    ageCompact: formatAgeFromDays(days, true)
  };
};

export const ageResolveErrorCode = (err: unknown): AgeResolveErrorCode | null => {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "INVALID_DOB" || code === "FUTURE_DOB" || code === "AGE_TOO_LARGE" || code === "INVALID_AGE") {
      return code;
    }
  }
  return null;
};
