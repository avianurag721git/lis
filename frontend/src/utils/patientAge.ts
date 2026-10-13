export const AGE_UNITS = ["DAYS", "MONTHS", "YEARS"] as const;
export type AgeUnit = (typeof AGE_UNITS)[number];

export const AGE_UNIT_OPTIONS: Array<{ value: AgeUnit; label: string }> = [
  { value: "DAYS", label: "Days" },
  { value: "MONTHS", label: "Months" },
  { value: "YEARS", label: "Years" }
];

const DAYS_PER_YEAR = 365.25;
const DAYS_PER_MONTH = 30.4375;
const NEONATE_DAYS = 28;
const INFANT_DAYS = 730;

const pad = (n: number): string => String(n).padStart(2, "0");

export const toIsoDateLocal = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseIsoDate = (raw: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return dt;
};

const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const daysBetweenLocal = (from: Date, to: Date): number => {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  return Math.floor((b - a) / 86_400_000);
};

export const maxForAgeUnit = (unit: AgeUnit): number => {
  if (unit === "DAYS") return 43800;
  if (unit === "MONTHS") return 1440;
  return 120;
};

export const ageDaysFromUnit = (value: number, unit: AgeUnit): number => {
  if (unit === "DAYS") return value;
  if (unit === "MONTHS") return Math.round(value * DAYS_PER_MONTH);
  return Math.round(value * DAYS_PER_YEAR);
};

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

export type PatientAgeFields = {
  dateOfBirth?: string | null;
  ageDays?: number | null;
  ageValue?: number | null;
  ageUnit?: AgeUnit | null;
  ageYears?: number | null;
  ageDisplay?: string | null;
  ageCompact?: string | null;
};

export const formatPatientAge = (patient: PatientAgeFields | null | undefined, compact = false): string | null => {
  if (!patient) return null;
  if (compact && patient.ageCompact) return patient.ageCompact;
  if (!compact && patient.ageDisplay) return patient.ageDisplay;
  if (patient.dateOfBirth) {
    const dob = parseIsoDate(patient.dateOfBirth);
    if (dob) return formatAgeFromDays(daysBetweenLocal(dob, new Date()), compact);
  }
  if (patient.ageDays != null) return formatAgeFromDays(patient.ageDays, compact);
  if (patient.ageValue != null && patient.ageUnit) {
    return formatAgeFromDays(ageDaysFromUnit(patient.ageValue, patient.ageUnit), compact);
  }
  if (patient.ageYears != null) return formatAgeFromDays(ageDaysFromUnit(patient.ageYears, "YEARS"), compact);
  return null;
};

export const ageFromDateOfBirth = (isoDate: string, asOf = new Date()): { value: number; unit: AgeUnit } | null => {
  const dob = parseIsoDate(isoDate);
  if (!dob) return null;
  const days = daysBetweenLocal(dob, asOf);
  if (days < 0) return null;
  return displayPartsFromAgeDays(days);
};
