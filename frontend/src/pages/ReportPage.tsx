import { FormEvent, useEffect, useMemo, useState } from "react";
import { reportApi } from "../modules/report/report.service";
import type { ActiveReportTemplate, PatientGender } from "../modules/report/report.service";
import { NumberField } from "../components/NumberField";

type GroupedTemplate = Array<{
  departmentName: string;
  tests: Array<{
    testName: string;
    items: ActiveReportTemplate["items"];
  }>;
}>;

export const ReportPage = (): JSX.Element => {
  const [patientId, setPatientId] = useState<string>("PAT-001");
  const [patientName, setPatientName] = useState<string>("Rahul Sharma");
  const [patientPhone, setPatientPhone] = useState<string>("+919999999999");
  const [pathologistName, setPathologistName] = useState<string>("Dr. Meera Gupta");
  const [patientGender, setPatientGender] = useState<PatientGender>("MALE");
  const [patientAgeYears, setPatientAgeYears] = useState<number>(30);

  const [template, setTemplate] = useState<ActiveReportTemplate | null>(null);
  const [itemsWithReference, setItemsWithReference] = useState<Array<{ parameterId: string; referenceRange: string }>>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [evaluations, setEvaluations] = useState<Record<string, { abnormal: boolean; referenceRange: string | null }>>({});

  const [reportId, setReportId] = useState<string>("");
  const [status, setStatus] = useState<string>("PENDING");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadTemplate = async (): Promise<void> => {
      try {
        const data = await reportApi.getActiveTemplateForPatient({ patientGender, patientAgeYears });
        setTemplate(data.template);
        setItemsWithReference(data.itemsWithReference);
        const nextValues: Record<string, string> = {};
        for (const item of data.template.items) {
          nextValues[item.parameterId] = parameterValues[item.parameterId] ?? "";
        }
        setParameterValues(nextValues);
        setEvaluations({});
      } catch {
        setTemplate(null);
        setItemsWithReference([]);
        setEvaluations({});
      }
    };

    void loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientGender, patientAgeYears]);

  const referenceByParameterId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of itemsWithReference) map.set(row.parameterId, row.referenceRange);
    return map;
  }, [itemsWithReference]);

  const grouped = useMemo<GroupedTemplate>(() => {
    if (!template) return [];
    const byDept = new Map<string, Map<string, ActiveReportTemplate["items"]>>();
    for (const item of template.items) {
      const dept = item.departmentName ?? "Other";
      const test = item.testName ?? "Test";
      const deptMap = byDept.get(dept) ?? new Map<string, ActiveReportTemplate["items"]>();
      const list = deptMap.get(test) ?? [];
      list.push(item);
      deptMap.set(test, list);
      byDept.set(dept, deptMap);
    }
    return Array.from(byDept.entries()).map(([departmentName, testsMap]) => ({
      departmentName,
      tests: Array.from(testsMap.entries()).map(([testName, items]) => ({ testName, items }))
    }));
  }, [template]);

  const generate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      if (!template) {
        setMessage("Template is not loaded yet.");
        return;
      }

      const parameterResults = template.items.map((item) => ({
        parameterId: item.parameterId,
        value: parameterValues[item.parameterId] ?? ""
      }));

      const allFilled = parameterResults.every((r) => r.value.trim().length > 0);
      if (!allFilled) {
        setMessage("Please fill in all parameter values.");
        return;
      }

      const evalResp = await reportApi.evaluateParameters({
        patientGender,
        patientAgeYears,
        templateType: template.templateType,
        parameterValues: parameterResults
      });
      const nextEval: typeof evaluations = {};
      for (const ev of evalResp.evaluations) {
        nextEval[ev.parameterId] = { abnormal: ev.abnormal, referenceRange: ev.referenceRange };
      }
      setEvaluations(nextEval);

      const data = await reportApi.generate({
        patientId,
        patientName,
        patientPhone,
        pathologistName,
        patientGender,
        patientAgeYears,
        templateType: template.templateType,
        parameterResults
      });
      setReportId(data.reportId);
      const current = await reportApi.getStatus(data.reportId);
      setStatus(current.status);
      setMessage("Report generated and notification triggered.");
    } catch {
      setMessage("Report generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async (): Promise<void> => {
    if (!reportId) return;
    const current = await reportApi.getStatus(reportId);
    setStatus(current.status);
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Lab reports</h1>
        <p className="page-subtitle">Fill patient details, enter values, and generate a PDF report with auto-highlighted abnormal results.</p>
      </div>

      <div className="card">
        <h2 className="card-title">New report</h2>
        <form className="form-grid" onSubmit={generate}>
          <label className="form-label">
            Patient ID
            <input value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
          </label>
          <label className="form-label">
            Patient name
            <input value={patientName} onChange={(e) => setPatientName(e.target.value)} required />
          </label>
          <label className="form-label">
            Patient WhatsApp
            <input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} required />
          </label>
          <label className="form-label">
            Gender
            <select value={patientGender} onChange={(e) => setPatientGender(e.target.value as PatientGender)} required>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="form-label">
            Age (years)
            <NumberField
              value={patientAgeYears}
              onValueChange={setPatientAgeYears}
              min={0}
              max={120}
              required
            />
          </label>
          <label className="form-label">
            Pathologist
            <input value={pathologistName} onChange={(e) => setPathologistName(e.target.value)} required />
          </label>

          {template ? (
            <div className="card card-highlight" style={{ gridColumn: "1 / -1" }}>
              <h3 className="card-title">Test parameters</h3>
              <p className="text-muted" style={{ marginTop: 0 }}>
                Reference ranges are calculated from gender and age.
              </p>

              <div className="form-grid" style={{ marginTop: 12 }}>
                {grouped.map((dept) => (
                  <details key={dept.departmentName} open>
                    <summary className="text-muted" style={{ fontWeight: 600, cursor: "pointer" }}>
                      {dept.departmentName}
                    </summary>
                    {dept.tests.map((test) => (
                      <details key={`${dept.departmentName}:${test.testName}`} open style={{ marginTop: 8 }}>
                        <summary className="text-muted" style={{ fontWeight: 600, cursor: "pointer" }}>
                          {test.testName}
                        </summary>
                        <div className="form-grid" style={{ marginTop: 12 }}>
                          {test.items.map((item) => {
                            const ref = referenceByParameterId.get(item.parameterId) ?? "—";
                            const ev = evaluations[item.parameterId];
                            return (
                              <label key={item.parameterId} className="form-label">
                                <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                  <span>
                                    {item.parameterName}
                                    {item.unit ? <span className="text-muted"> ({item.unit})</span> : null}
                                  </span>
                                  {ev ? (
                                    <span className={`badge ${ev.abnormal ? "badge-tx--failed" : "badge-tx--ready"}`}>
                                      {ev.abnormal ? "Abnormal" : "Normal"}
                                    </span>
                                  ) : null}
                                </span>
                                <input
                                  value={parameterValues[item.parameterId] ?? ""}
                                  onChange={(e) =>
                                    setParameterValues((prev) => ({
                                      ...prev,
                                      [item.parameterId]: e.target.value
                                    }))
                                  }
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  placeholder={item.unit ?? "Value"}
                                  required
                                />
                                {item.showReferenceRange ? (
                                  <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                                    Normal: {ref}
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </details>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted" style={{ gridColumn: "1 / -1" }}>
              Loading template…
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !template}>
              {busy ? "Generating…" : "Generate PDF report"}
            </button>
          </div>
        </form>
      </div>

      {reportId ? (
        <div className="card">
          <h2 className="card-title">Report status</h2>
          <dl className="kv-grid">
            <dt>Report ID</dt>
            <dd className="mono">{reportId}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`badge badge-tx badge-tx--${status.toLowerCase()}`}>{status}</span>
            </dd>
          </dl>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void refreshStatus()}>
              Refresh status
            </button>
            {status === "READY" ? (
              <a className="btn btn-primary" href={reportApi.getDownloadUrl(reportId)} target="_blank" rel="noreferrer">
                Download PDF
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <p className={message.includes("failed") ? "banner banner-error" : "banner banner-success"}>{message}</p> : null}
    </section>
  );
};
