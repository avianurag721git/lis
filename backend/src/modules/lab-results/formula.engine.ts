/**
 * Safe arithmetic formula evaluator.
 * Supports + - * / and parentheses. Identifiers are substituted from a values map
 * (e.g. Total_Bilirubin, Direct_Bilirubin, Triglycerides).
 */
export const evaluateFormula = (formula: string, values: Record<string, number>): number | null => {
  const cleaned = formula
    .replace(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, "") // strip "LDL =" assignment prefix
    .trim();
  if (!cleaned) return null;

  let expr = cleaned;
  // Longest aliases first to avoid partial replacements
  const aliases = Object.keys(values).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    expr = expr.replace(re, String(values[alias]));
  }

  // If any remaining identifiers, formula cannot be fully evaluated yet
  if (/[A-Za-z_]/.test(expr)) {
    return null;
  }

  if (!/^[\d\s.+\-*/()]+$/.test(expr)) {
    return null;
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)() as unknown;
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
};

export const aliasFromParameterName = (name: string): string => {
  return name
    .replace(/[()]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
};
