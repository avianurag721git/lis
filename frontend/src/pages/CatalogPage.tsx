import { FormEvent, useEffect, useMemo, useState } from "react";
import { catalogApi, Department, Gender, Parameter, RangeRule, Test, TestParameter } from "../modules/catalog/catalog.service";

type DraftRule = Omit<RangeRule, "id">;

const emptyRule = (): DraftRule => ({
  gender: "ALL",
  ageMin: 18,
  ageMax: 120,
  normalMin: null,
  normalMax: null
});

export const CatalogPage = (): JSX.Element => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [assignedParameters, setAssignedParameters] = useState<TestParameter[]>([]);
  const [allParameters, setAllParameters] = useState<Parameter[]>([]);

  const [departmentId, setDepartmentId] = useState<string>("");
  const [testId, setTestId] = useState<string>("");
  const [parameterId, setParameterId] = useState<string>("");
  const [assignParameterId, setAssignParameterId] = useState<string>("");

  const [rules, setRules] = useState<DraftRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [newDepartmentName, setNewDepartmentName] = useState<string>("");
  const [newTestName, setNewTestName] = useState<string>("");
  const [newTestCode, setNewTestCode] = useState<string>("");
  const [newParameterName, setNewParameterName] = useState<string>("");
  const [newParameterUnit, setNewParameterUnit] = useState<string>("");

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const deps = await catalogApi.listDepartments();
        setDepartments(deps);
        const first = deps.at(0)?.id ?? "";
        setDepartmentId(first);
      } catch {
        setDepartments([]);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const p = await catalogApi.listAllParameters();
        setAllParameters(p);
        setAssignParameterId(p.at(0)?.id ?? "");
      } catch {
        setAllParameters([]);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!departmentId) {
        setTests([]);
        setTestId("");
        return;
      }
      try {
        const t = await catalogApi.listTests(departmentId);
        setTests(t);
        const first = t.at(0)?.id ?? "";
        setTestId(first);
      } catch {
        setTests([]);
      }
    };
    void load();
  }, [departmentId]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!testId) {
        setAssignedParameters([]);
        setParameterId("");
        return;
      }
      try {
        const p = await catalogApi.listParameters(testId);
        setAssignedParameters(p);
        const first = p.at(0)?.id ?? "";
        setParameterId(first);
      } catch {
        setAssignedParameters([]);
      }
    };
    void load();
  }, [testId]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setMsg("");
      if (!parameterId) {
        setRules([]);
        return;
      }
      try {
        const existing = await catalogApi.listRanges(parameterId);
        setRules(
          existing.length > 0
            ? existing.map((r) => ({
                gender: r.gender,
                ageMin: r.ageMin,
                ageMax: r.ageMax,
                normalMin: r.normalMin,
                normalMax: r.normalMax
              }))
            : [emptyRule()]
        );
      } catch {
        setRules([emptyRule()]);
      }
    };
    void load();
  }, [parameterId]);

  const selectedParameter = useMemo(
    () => allParameters.find((p) => p.id === parameterId) ?? assignedParameters.find((p) => p.id === parameterId) ?? null,
    [allParameters, assignedParameters, parameterId]
  );

  const createDepartment = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const dep = await catalogApi.createDepartment(newDepartmentName);
      setDepartments((prev) => {
        const exists = prev.some((d) => d.id === dep.id);
        return exists ? prev : [...prev, dep].sort((a, b) => a.name.localeCompare(b.name));
      });
      setDepartmentId(dep.id);
      setNewDepartmentName("");
      setMsg("Department created.");
    } catch {
      setMsg("Department create failed.");
    } finally {
      setBusy(false);
    }
  };

  const createTest = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!departmentId) return;
    setBusy(true);
    setMsg("");
    try {
      const t = await catalogApi.createTest(departmentId, { name: newTestName, code: newTestCode || null });
      setTests((prev) => {
        const exists = prev.some((x) => x.id === t.id);
        return exists ? prev : [...prev, t].sort((a, b) => a.name.localeCompare(b.name));
      });
      setTestId(t.id);
      setNewTestName("");
      setNewTestCode("");
      setMsg("Test created.");
    } catch {
      setMsg("Test create failed.");
    } finally {
      setBusy(false);
    }
  };

  const createParameter = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const p = await catalogApi.createParameter({ name: newParameterName, unit: newParameterUnit || null, valueType: "NUMERIC" });
      setAllParameters((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      setParameterId(p.id);
      if (!assignParameterId) setAssignParameterId(p.id);
      setNewParameterName("");
      setNewParameterUnit("");
      setMsg("Parameter created.");
    } catch {
      setMsg("Parameter create failed.");
    } finally {
      setBusy(false);
    }
  };

  const assignParameter = async (): Promise<void> => {
    if (!testId || !assignParameterId) return;
    setBusy(true);
    setMsg("");
    try {
      await catalogApi.assignParameter(testId, { parameterId: assignParameterId });
      const updated = await catalogApi.listParameters(testId);
      setAssignedParameters(updated);
      if (!parameterId) setParameterId(updated.at(0)?.id ?? "");
      setMsg("Assigned.");
    } catch {
      setMsg("Assign failed.");
    } finally {
      setBusy(false);
    }
  };

  const unassignParameter = async (pId: string): Promise<void> => {
    if (!testId) return;
    setBusy(true);
    setMsg("");
    try {
      await catalogApi.unassignParameter(testId, pId);
      const updated = await catalogApi.listParameters(testId);
      setAssignedParameters(updated);
      if (parameterId === pId) setParameterId(updated.at(0)?.id ?? "");
      setMsg("Removed.");
    } catch {
      setMsg("Remove failed.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await catalogApi.replaceRanges(parameterId, rules);
      setMsg("Saved.");
    } catch {
      setMsg("Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Test catalog setup</h1>
        <p className="page-subtitle">
          Flow: create <strong>Department</strong> → create <strong>Test</strong> → create <strong>Parameter</strong> → assign parameters to the
          test → set <strong>normal ranges</strong>.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Step 1–3: Create master data</h2>
        <div className="form-grid">
          <form onSubmit={(e) => void createDepartment(e)}>
            <label className="form-label">
              Department
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} placeholder="e.g. Hematology" />
                <button type="submit" disabled={busy || !newDepartmentName.trim()}>
                  Create
                </button>
              </div>
            </label>
          </form>

          <form onSubmit={(e) => void createTest(e)}>
            <label className="form-label">
              Test (created inside selected department)
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newTestName} onChange={(e) => setNewTestName(e.target.value)} placeholder="e.g. CBC" />
                <input value={newTestCode} onChange={(e) => setNewTestCode(e.target.value)} placeholder="Code (optional)" style={{ maxWidth: 160 }} />
                <button type="submit" disabled={busy || !departmentId || !newTestName.trim()}>
                  Create
                </button>
              </div>
            </label>
          </form>

          <form onSubmit={(e) => void createParameter(e)}>
            <label className="form-label">
              Parameter (global master list)
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newParameterName} onChange={(e) => setNewParameterName(e.target.value)} placeholder="e.g. Hemoglobin" />
                <input value={newParameterUnit} onChange={(e) => setNewParameterUnit(e.target.value)} placeholder="Unit (optional)" style={{ maxWidth: 160 }} />
                <button type="submit" disabled={busy || !newParameterName.trim()}>
                  Create
                </button>
              </div>
            </label>
          </form>
        </div>

        {msg ? <p className="text-muted">{msg}</p> : null}

        <h2 className="card-title" style={{ marginTop: 16 }}>Step 4: Assign parameters to a test</h2>
        <div className="form-grid">
          <label className="form-label">
            Department
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Test
            <select value={testId} onChange={(e) => setTestId(e.target.value)}>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Parameter (selected parameter is used in Step 5)
            <select value={parameterId} onChange={(e) => setParameterId(e.target.value)}>
              {assignedParameters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.unit ? ` (${p.unit})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="form-label">
            Assign parameter to selected test
            <div style={{ display: "flex", gap: 8 }}>
              <select value={assignParameterId} onChange={(e) => setAssignParameterId(e.target.value)} style={{ flex: 1 }}>
                {allParameters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.unit ? ` (${p.unit})` : ""}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void assignParameter()} disabled={busy || !testId || !assignParameterId}>
                Assign
              </button>
            </div>
          </label>
          <div className="form-label">
            Assigned parameters
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Unit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {assignedParameters.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-muted">
                        No parameters assigned yet.
                      </td>
                    </tr>
                  ) : (
                    assignedParameters.map((p) => (
                      <tr key={p.assignmentId}>
                        <td>{p.name}</td>
                        <td>{p.unit ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" onClick={() => void unassignParameter(p.id)} disabled={busy}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Step 5: Normal ranges</h2>
        <p className="text-muted" style={{ marginTop: 0 }}>
          Parameter: <strong>{selectedParameter?.name ?? "—"}</strong>
        </p>
        <form onSubmit={(e) => void save(e)}>
          <div className="table-scroll">
            <table className="data-table">
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
                {rules.map((r, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        value={r.gender}
                        onChange={(e) =>
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, gender: e.target.value as Gender } : x)))
                        }
                      >
                        <option value="ALL">ALL</option>
                        <option value="MALE">MALE</option>
                        <option value="FEMALE">FEMALE</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={r.ageMin ?? ""}
                        onChange={(e) =>
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, ageMin: e.target.value === "" ? null : Number(e.target.value) } : x)))
                        }
                        min={0}
                        max={120}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={r.ageMax ?? ""}
                        onChange={(e) =>
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, ageMax: e.target.value === "" ? null : Number(e.target.value) } : x)))
                        }
                        min={0}
                        max={120}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={r.normalMin ?? ""}
                        onChange={(e) =>
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, normalMin: e.target.value === "" ? null : Number(e.target.value) } : x)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={r.normalMax ?? ""}
                        onChange={(e) =>
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, normalMax: e.target.value === "" ? null : Number(e.target.value) } : x)))
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-text"
                        onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={rules.length <= 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setRules((prev) => [...prev, emptyRule()])}>
              Add row
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !parameterId}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
        {msg ? <p className={msg.includes("failed") ? "text-error" : "text-success"}>{msg}</p> : null}
      </div>
    </section>
  );
};

