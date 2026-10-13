/**
 * Westgard multi-rule QC validator (NABL).
 * Reject rules that trigger OUT_OF_CALIBRATION interlock: 1-3s, 2-2s, R-4s.
 */

export type WestgardRule =
  | "1-2s"
  | "1-3s"
  | "2-2s"
  | "R-4s"
  | "4-1s"
  | "10x";

export type ControlLevel =
  | "NORMAL"
  | "HIGH"
  | "LEVEL_1_NORMAL"
  | "LEVEL_2_HIGH"
  | "LEVEL_3_LOW";

export type ControlPoint = {
  observedValue: number;
  targetMean: number;
  targetSd: number;
  controlLevel: ControlLevel;
  runDate: string;
};

export type WestgardEvaluation = {
  zScore: number;
  flags: WestgardRule[];
  isReject: boolean;
  rejectRules: WestgardRule[];
  warningRules: WestgardRule[];
  status: "PASSED" | "WARNING" | "REJECTED";
  violatedRule: WestgardRule | null;
  correctiveAction: string;
};

const REJECT_RULES: readonly WestgardRule[] = ["1-3s", "2-2s", "R-4s"];

const zOf = (value: number, mean: number, sd: number): number => {
  if (sd === 0) return 0;
  return (value - mean) / sd;
};

const sameSide = (a: number, b: number): boolean => (a > 0 && b > 0) || (a < 0 && b < 0);

export const normalizeControlLevel = (level: string): ControlLevel => {
  if (level === "NORMAL") return "LEVEL_1_NORMAL";
  if (level === "HIGH") return "LEVEL_2_HIGH";
  if (
    level === "LEVEL_1_NORMAL" ||
    level === "LEVEL_2_HIGH" ||
    level === "LEVEL_3_LOW" ||
    level === "NORMAL" ||
    level === "HIGH"
  ) {
    return level as ControlLevel;
  }
  return "LEVEL_1_NORMAL";
};

export const westgardCorrectiveAction = (
  rule: WestgardRule | null,
  instrumentCode?: string | null
): string => {
  const analyzer = instrumentCode?.trim() || "the analyzer";
  switch (rule) {
    case "1-3s":
      return `Recalibrate ${analyzer} channel; repeat Level controls before releasing patient results.`;
    case "2-2s":
      return `Systematic bias — recalibrate ${analyzer}, check reagent lot / calibrator, then run calibration pass.`;
    case "R-4s":
      return `Random error / carryover on ${analyzer} — inspect probes, rinse, recalibrate, then log calibration pass.`;
    case "4-1s":
      return `Drift warning on ${analyzer} — verify calibration curve and reagent integrity.`;
    case "10x":
      return `Shift warning on ${analyzer} — review mean/SD targets and recalibrate if confirmed.`;
    case "1-2s":
      return `Warning only — monitor next control; no patient release block yet.`;
    default:
      return "No corrective action required.";
  }
};

/**
 * Evaluate the newest point against history (oldest → newest prior points, excluding current).
 */
export const evaluateWestgard = (current: ControlPoint, history: ControlPoint[]): WestgardEvaluation => {
  const z = zOf(current.observedValue, current.targetMean, current.targetSd);
  const flags: WestgardRule[] = [];
  const absZ = Math.abs(z);

  if (absZ > 3) flags.push("1-3s");
  if (absZ > 2) flags.push("1-2s");

  const prior = [...history].reverse();
  const zHistory = prior.map((p) => zOf(p.observedValue, p.targetMean, p.targetSd));

  if (absZ > 2 && zHistory[0] != null && Math.abs(zHistory[0]) > 2 && sameSide(z, zHistory[0])) {
    flags.push("2-2s");
  }

  // R-4s: consecutive points span > 4 SD (e.g. one > +2s and another < −2s)
  if (zHistory[0] != null && Math.abs(z - zHistory[0]) > 4) {
    flags.push("R-4s");
  }

  const four = [z, ...zHistory.slice(0, 3)];
  if (
    four.length === 4 &&
    four.every((v) => Math.abs(v) > 1) &&
    four.every((v) => sameSide(v, four[0]!))
  ) {
    flags.push("4-1s");
  }

  const ten = [z, ...zHistory.slice(0, 9)];
  if (ten.length === 10 && ten.every((v) => v !== 0 && sameSide(v, ten[0]!))) {
    flags.push("10x");
  }

  const unique = [...new Set(flags)];
  const rejectRules = unique.filter((r) => (REJECT_RULES as readonly string[]).includes(r));
  const warningRules = unique.filter((r) => !rejectRules.includes(r));
  const isReject = rejectRules.length > 0;
  const violatedRule = (rejectRules[0] ?? warningRules[0] ?? null) as WestgardRule | null;
  const status: WestgardEvaluation["status"] = isReject ? "REJECTED" : warningRules.length ? "WARNING" : "PASSED";

  return {
    zScore: Math.round(z * 1000) / 1000,
    flags: unique,
    isReject,
    rejectRules,
    warningRules,
    status,
    violatedRule,
    correctiveAction: westgardCorrectiveAction(violatedRule)
  };
};

/** Mean ± n*SD guide lines for L-J chart. */
export const leveyJenningsBands = (mean: number, sd: number): Record<string, number> => ({
  mean,
  plus1sd: mean + sd,
  plus2sd: mean + 2 * sd,
  plus3sd: mean + 3 * sd,
  minus1sd: mean - sd,
  minus2sd: mean - 2 * sd,
  minus3sd: mean - 3 * sd
});
