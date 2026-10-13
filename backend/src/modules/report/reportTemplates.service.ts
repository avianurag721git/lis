import { reportTemplatesRepository } from "./reportTemplates.repository";
import {
  ActiveReportTemplate,
  PatientGender,
  ParameterEvaluation,
  ParameterNormalRange,
  ReportTemplateType
} from "./reportTemplates.types";

type NormalRangeRule = {
  parameterId: string;
  gender: PatientGender | "ALL";
  ageMin: number | null;
  ageMax: number | null;
  normalMin: number | null;
  normalMax: number | null;
};

const parseNumberOrNull = (raw: string): number | null => {
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

const formatReferenceRange = (normalMin: number | null, normalMax: number | null): string => {
  if (normalMin == null && normalMax == null) return "—";
  if (normalMin != null && normalMax == null) return `>= ${normalMin}`;
  if (normalMin == null && normalMax != null) return `<= ${normalMax}`;
  return `${normalMin} - ${normalMax}`;
};

const ageMatches = (ageYears: number, ageMin: number | null, ageMax: number | null): boolean => {
  if (ageMin != null && ageYears < ageMin) return false;
  if (ageMax != null && ageYears > ageMax) return false;
  return true;
};

const chooseBestRule = (rules: NormalRangeRule[], patientGender: PatientGender, patientAgeYears: number): NormalRangeRule | null => {
  const matching = rules.filter((r) => {
    const genderOk = r.gender === "ALL" || r.gender === patientGender;
    if (!genderOk) return false;
    return ageMatches(patientAgeYears, r.ageMin, r.ageMax);
  });
  if (matching.length === 0) return null;

  const score = (r: NormalRangeRule): number => {
    const genderScore = r.gender === patientGender ? 0 : 1; // exact match preferred
    const bandWidth =
      r.ageMin != null && r.ageMax != null ? Math.max(0, r.ageMax - r.ageMin) : Number.POSITIVE_INFINITY;
    return genderScore * 1_000_000 + bandWidth; // narrower band preferred
  };

  return matching.sort((a, b) => score(a) - score(b))[0] ?? null;
};

const mapRepositoryRules = (
  rows: Array<{
    parameter_id: string;
    gender: PatientGender | "ALL";
    age_min: number | null;
    age_max: number | null;
    normal_min: string | number | null;
    normal_max: string | number | null;
  }>
): NormalRangeRule[] => {
  return rows.map((r) => ({
    parameterId: r.parameter_id,
    gender: r.gender,
    ageMin: r.age_min,
    ageMax: r.age_max,
    normalMin: r.normal_min == null ? null : Number(r.normal_min),
    normalMax: r.normal_max == null ? null : Number(r.normal_max)
  }));
};

export const reportTemplatesService = {
  async getActiveTemplateForPatient(input: {
    tenantId: string;
    templateType: ReportTemplateType;
    patientGender: PatientGender;
    patientAgeYears: number;
  }): Promise<{ template: ActiveReportTemplate; itemsWithReference: Array<{ parameterId: string; referenceRange: string }> }> {
    const template = await reportTemplatesRepository.getActiveTemplateWithItems(input.tenantId, input.templateType);
    const parameterIds = template.items.map((i) => i.parameterId);
    const rulesRows = await reportTemplatesRepository.getNormalRangesForParameters(input.tenantId, parameterIds);
    const rules = mapRepositoryRules(rulesRows);

    const itemsWithReference = template.items.map((item) => {
      const relevant = rules.filter((r) => r.parameterId === item.parameterId);
      const best = chooseBestRule(relevant, input.patientGender, input.patientAgeYears);
      const ref = best ? formatReferenceRange(best.normalMin, best.normalMax) : "—";
      return { parameterId: item.parameterId, referenceRange: ref };
    });

    return { template, itemsWithReference };
  },

  async evaluateParametersForPatient(input: {
    tenantId: string;
    templateType: ReportTemplateType;
    patientGender: PatientGender;
    patientAgeYears: number;
    parameterValues: Array<{ parameterId: string; value: string }>;
  }): Promise<ParameterEvaluation[]> {
    const template = await reportTemplatesRepository.getActiveTemplateWithItems(input.tenantId, input.templateType);
    const rulesRows = await reportTemplatesRepository.getNormalRangesForParameters(
      input.tenantId,
      template.items.map((i) => i.parameterId)
    );
    const rules = mapRepositoryRules(rulesRows);

    const valueByParameter = new Map(input.parameterValues.map((v) => [v.parameterId, v.value]));

    return template.items.map((item) => {
      const rawValue = valueByParameter.get(item.parameterId) ?? "";
      const numericValue = parseNumberOrNull(rawValue);
      const relevant = rules.filter((r) => r.parameterId === item.parameterId);
      const best = chooseBestRule(relevant, input.patientGender, input.patientAgeYears);

      const normalMin = best?.normalMin ?? null;
      const normalMax = best?.normalMax ?? null;
      const referenceRange = best ? formatReferenceRange(normalMin, normalMax) : null;

      let abnormal = false;
      if (numericValue != null && (normalMin != null || normalMax != null)) {
        if (normalMin != null && numericValue < normalMin) abnormal = true;
        if (normalMax != null && numericValue > normalMax) abnormal = true;
      }

      return {
        parameterId: item.parameterId,
        value: rawValue,
        referenceRange,
        abnormal,
        parameterName: item.parameterName,
        unit: item.unit,
        ...(item.testName ? { testName: item.testName } : {}),
        ...(item.departmentName ? { departmentName: item.departmentName } : {})
      };
    });
  }
};

