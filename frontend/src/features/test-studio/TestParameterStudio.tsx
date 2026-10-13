import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beaker, Calculator, Plus, Save, Trash2, Wand2 } from "lucide-react";
import {
  catalogApi,
  Department,
  Gender,
  ParameterInputType,
  RangeRule,
  TestParameterStudio as StudioParameter,
} from "../../modules/catalog/catalog.service";

type DraftRule = Omit<RangeRule, "id">;

const emptyRule = (): DraftRule => ({
  gender: "ALL",
  ageMin: 18,
  ageMax: 120,
  normalMin: null,
  normalMax: null
});

const inputTypeOptions: Array<{ value: ParameterInputType; label: string }> = [
  { value: "NUMERIC", label: "Numeric" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "TEXT", label: "Text" },
  { value: "FORMULA", label: "Formula (calculated)" }
];

const aliasFromName = (name: string): string =>
  name
    .replace(/[()]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

export const TestParameterStudio = (): JSX.Element => {
  const qc = useQueryClient();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [testId, setTestId] = useState("");
  const [selectedParamId, setSelectedParamId] = useState<string>("");
  const [msg, setMsg] = useState("");

  const [draft, setDraft] = useState({
    name: "",
    unit: "",
    inputType: "NUMERIC" as ParameterInputType,
    formula: "",
    formulaAlias: "",
    dropdownOptions: "",
    criticalLow: "",
    criticalHigh: "",
    methodology: "",
    analyzerCode: ""
  });
  const [rules, setRules] = useState<DraftRule[]>([emptyRule()]);
  const [formulaPreviewValues, setFormulaPreviewValues] = useState("");
  const [formulaPreviewResult, setFormulaPreviewResult] = useState<string>("");

  useEffect(() => {
    void catalogApi.listDepartments().then((deps) => {
      setDepartments(deps);
      setDepartmentId(deps[0]?.id ?? "");
    });
  }, []);

  const { data: tests = [] } = useQuery({
    queryKey: ["studio-tests", departmentId],
    queryFn: () => catalogApi.listTests(departmentId),
    enabled: Boolean(departmentId)
  });

  useEffect(() => {
    setTestId(tests[0]?.id ?? "");
  }, [tests]);

  const { data: studio, isLoading } = useQuery({
    queryKey: ["test-studio", testId],
    queryFn: () => catalogApi.getTestStudio(testId),
    enabled: Boolean(testId)
  });

  const selectedParam: StudioParameter | undefined = useMemo(
    () => studio?.parameters.find((p) => p.id === selectedParamId),
    [studio, selectedParamId]
  );

  useEffect(() => {
    if (!selectedParam) return;
    setDraft({
      name: selectedParam.name,
      unit: selectedParam.unit ?? "",
      inputType: selectedParam.inputType ?? "NUMERIC",
      formula: selectedParam.formula ?? "",
      formulaAlias: selectedParam.formulaAlias ?? aliasFromName(selectedParam.name),
      dropdownOptions: (selectedParam.dropdownOptions ?? []).join(", "),
      criticalLow: selectedParam.criticalLow != null ? String(selectedParam.criticalLow) : "",
      criticalHigh: selectedParam.criticalHigh != null ? String(selectedParam.criticalHigh) : "",
      methodology: selectedParam.methodology ?? "",
      analyzerCode: selectedParam.analyzerCode ?? ""
    });
    setRules(
      selectedParam.ranges.length
        ? selectedParam.ranges.map(({ gender, ageMin, ageMax, normalMin, normalMax }) => ({
            gender,
            ageMin,
            ageMax,
            normalMin,
            normalMax
          }))
        : [emptyRule()]
    );
  }, [selectedParam]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParamId) throw new Error("Select a parameter");
      return catalogApi.saveParameterStudio(selectedParamId, {
        parameter: {
          name: draft.name.trim(),
          unit: draft.unit.trim() || null,
          inputType: draft.inputType,
          formula: draft.inputType === "FORMULA" ? draft.formula.trim() || null : null,
          formulaAlias:
            draft.inputType === "FORMULA"
              ? draft.formulaAlias.trim() || aliasFromName(draft.name)
              : null,
          dropdownOptions:
            draft.inputType === "DROPDOWN"
              ? draft.dropdownOptions
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          criticalLow: draft.criticalLow.trim() ? Number(draft.criticalLow) : null,
          criticalHigh: draft.criticalHigh.trim() ? Number(draft.criticalHigh) : null,
          methodology: draft.methodology.trim() || null,
          analyzerCode: draft.analyzerCode.trim() || null
        },
        ranges: rules
      });
    },
    onSuccess: async () => {
      setMsg("Parameter saved.");
      await qc.invalidateQueries({ queryKey: ["test-studio", testId] });
    },
    onError: () => setMsg("Save failed.")
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!testId || !draft.name.trim()) throw new Error("Name required");
      return catalogApi.createParameterForTest(testId, {
        name: draft.name.trim(),
        unit: draft.unit.trim() || null,
        inputType: draft.inputType,
        formula: draft.inputType === "FORMULA" ? draft.formula.trim() || null : null,
        formulaAlias: draft.formulaAlias.trim() || aliasFromName(draft.name),
        dropdownOptions:
          draft.inputType === "DROPDOWN"
            ? draft.dropdownOptions
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        criticalLow: draft.criticalLow.trim() ? Number(draft.criticalLow) : null,
        criticalHigh: draft.criticalHigh.trim() ? Number(draft.criticalHigh) : null,
        methodology: draft.methodology.trim() || null,
        analyzerCode: draft.analyzerCode.trim() || null,
        ranges: rules
      });
    },
    onSuccess: async (param) => {
      setMsg(`Created "${param.name}".`);
      setSelectedParamId(param.id);
      await qc.invalidateQueries({ queryKey: ["test-studio", testId] });
    },
    onError: () => setMsg("Create failed.")
  });

  const previewFormula = async (): Promise<void> => {
    try {
      const values: Record<string, number> = {};
      for (const pair of formulaPreviewValues.split(",")) {
        const [k, v] = pair.split("=").map((s) => s.trim());
        if (k && v) values[k] = Number(v);
      }
      const result = await catalogApi.previewFormula(draft.formula, values);
      setFormulaPreviewResult(result == null ? "Cannot evaluate (missing inputs?)" : String(result));
    } catch {
      setFormulaPreviewResult("Preview failed");
    }
  };

  const beginNew = (): void => {
    setSelectedParamId("");
    setDraft({
      name: "",
      unit: "",
      inputType: "NUMERIC",
      formula: "",
      formulaAlias: "",
      dropdownOptions: "",
      criticalLow: "",
      criticalHigh: "",
      methodology: "",
      analyzerCode: ""
    });
    setRules([emptyRule()]);
    setMsg("");
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (selectedParamId) saveMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <section className="page-shell space-y-5">
      <div className="page-head">
        <h1 className="page-title flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-primary" aria-hidden />
          Test &amp; Parameter Studio
        </h1>
        <p className="page-subtitle">
          No-code builder — add parameters, formulas, dropdowns, and gender/age reference ranges to any test.
        </p>
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="card p-4 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">Department</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <label className="block text-xs font-medium text-muted-foreground">Test</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
          >
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parameters</p>
            <button type="button" className="text-xs text-primary inline-flex items-center gap-1" onClick={beginNew}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New
            </button>
          </div>

          {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {(studio?.parameters ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedParamId(p.id)}
                  className={`w-full text-left rounded-md px-2 py-1.5 text-sm ${
                    selectedParamId === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
                  }`}
                >
                  {p.name}
                  <span className="block text-[10px] text-muted-foreground">{p.inputType ?? "NUMERIC"}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <form className="card p-5 space-y-5" onSubmit={onSubmit}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Beaker className="h-4 w-4" aria-hidden />
            {studio ? (
              <span>
                {studio.departmentName} · <strong className="text-foreground">{studio.test.name}</strong>
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium">Parameter name</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    name,
                    formulaAlias: d.formulaAlias || aliasFromName(name)
                  }));
                }}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Unit</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.unit}
                onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                placeholder="mg/dL, %, U/L…"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Input type</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.inputType}
                onChange={(e) => setDraft((d) => ({ ...d, inputType: e.target.value as ParameterInputType }))}
              >
                {inputTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Analyzer code (HL7/ASTM)</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.analyzerCode}
                onChange={(e) => setDraft((d) => ({ ...d, analyzerCode: e.target.value }))}
              />
            </label>
          </div>

          {draft.inputType === "DROPDOWN" ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium">Dropdown options (comma-separated)</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.dropdownOptions}
                onChange={(e) => setDraft((d) => ({ ...d, dropdownOptions: e.target.value }))}
                placeholder="Negative, Trace, 1+, 2+, 3+"
              />
            </label>
          ) : null}

          {draft.inputType === "FORMULA" ? (
            <div className="space-y-3 rounded-lg border border-border/60 p-4 bg-muted/20">
              <p className="text-xs font-semibold flex items-center gap-1">
                <Calculator className="h-4 w-4" aria-hidden /> Formula expression editor
              </p>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Expression</span>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono min-h-[80px]"
                  value={draft.formula}
                  onChange={(e) => setDraft((d) => ({ ...d, formula: e.target.value }))}
                  placeholder="LDL = Total_Cholesterol - HDL - (Triglycerides / 5)"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Alias (for substitution)</span>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  value={draft.formulaAlias}
                  onChange={(e) => setDraft((d) => ({ ...d, formulaAlias: e.target.value }))}
                />
              </label>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 min-w-[200px] space-y-1">
                  <span className="text-xs font-medium">Preview values (Alias=12, Other=5)</span>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    value={formulaPreviewValues}
                    onChange={(e) => setFormulaPreviewValues(e.target.value)}
                  />
                </label>
                <button type="button" className="px-3 py-2 text-sm" onClick={() => void previewFormula()}>
                  Test formula
                </button>
                {formulaPreviewResult ? (
                  <span className="text-sm font-medium text-primary">= {formulaPreviewResult}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium">Critical low</span>
              <input
                type="number"
                step="any"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.criticalLow}
                onChange={(e) => setDraft((d) => ({ ...d, criticalLow: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Critical high</span>
              <input
                type="number"
                step="any"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={draft.criticalHigh}
                onChange={(e) => setDraft((d) => ({ ...d, criticalHigh: e.target.value }))}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium">Methodology note</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={draft.methodology}
              onChange={(e) => setDraft((d) => ({ ...d, methodology: e.target.value }))}
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Gender / age reference ranges
              </p>
              <button
                type="button"
                className="text-xs text-primary"
                onClick={() => setRules((r) => [...r, emptyRule()])}
              >
                + Add rule
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Gender</th>
                    <th>Age min</th>
                    <th>Age max</th>
                    <th>Normal min</th>
                    <th>Normal max</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          value={rule.gender}
                          onChange={(e) =>
                            setRules((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, gender: e.target.value as Gender } : r
                              )
                            )
                          }
                        >
                          {(["ALL", "MALE", "FEMALE", "OTHER"] as Gender[]).map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(["ageMin", "ageMax", "normalMin", "normalMax"] as const).map((field) => (
                        <td key={field}>
                          <input
                            type="number"
                            className="w-20"
                            value={rule[field] ?? ""}
                            onChange={(e) =>
                              setRules((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        [field]: e.target.value === "" ? null : Number(e.target.value)
                                      }
                                    : r
                                )
                              )
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          aria-label="Remove rule"
                          onClick={() => setRules((rows) => rows.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              disabled={saveMutation.isPending || createMutation.isPending}
            >
              <Save className="h-4 w-4" aria-hidden />
              {selectedParamId ? "Save parameter" : "Create & assign to test"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
