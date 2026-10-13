import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Patient, PatientGender, patientsApi } from "../modules/patients/patients.service";
import { LongitudinalTrajectory } from "../features/patient-portal/LongitudinalTrajectory";
import { PatientAgeFields } from "../components/PatientAgeFields";
import { formatPatientAge, type AgeUnit } from "../utils/patientAge";

const genderOptions: Array<{ value: PatientGender; label: string }> = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" }
];

export const PatientsPage = (): JSX.Element => {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState<string>(() => searchParams.get("q") ?? "");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [patientCode, setPatientCode] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [gender, setGender] = useState<PatientGender | "">("");
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [ageValue, setAgeValue] = useState<string>("");
  const [ageUnit, setAgeUnit] = useState<AgeUnit>("YEARS");

  const [editingId, setEditingId] = useState<string>("");
  const [trajectoryPatientId, setTrajectoryPatientId] = useState<string>("");

  const load = async (query?: string): Promise<void> => {
    setError("");
    try {
      const rows = await patientsApi.list(query);
      setPatients(rows);
    } catch {
      setPatients([]);
      setError("Unable to load patients. Please try again.");
    }
  };

  useEffect(() => {
    const fromUrl = searchParams.get("q") ?? "";
    setQ(fromUrl);
    void load(fromUrl || undefined);
  }, [searchParams]);

  const selected = useMemo(() => patients.find((p) => p.id === editingId) ?? null, [patients, editingId]);

  const resetForm = (): void => {
    setEditingId("");
    setPatientCode("");
    setName("");
    setPhone("");
    setGender("");
    setDateOfBirth("");
    setAgeValue("");
    setAgeUnit("YEARS");
  };

  const beginEdit = (p: Patient): void => {
    setEditingId(p.id);
    setPatientCode(p.patientCode);
    setName(p.name);
    setPhone(p.phone ?? "");
    setGender(p.gender ?? "");
    setDateOfBirth(p.dateOfBirth ?? "");
    setAgeValue(p.ageValue != null ? String(p.ageValue) : p.ageYears != null ? String(p.ageYears) : "");
    setAgeUnit(p.ageUnit ?? "YEARS");
    setStatus("");
    setError("");
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (editingId) {
        const updated = await patientsApi.update(editingId, {
          patientCode,
          name,
          phone: phone.trim() ? phone.trim() : null,
          gender: gender || null,
          dateOfBirth: dateOfBirth.trim() || null,
          ageValue: ageValue.trim() ? Number(ageValue) : null,
          ageUnit: ageValue.trim() || dateOfBirth.trim() ? ageUnit : null,
          ageYears: !dateOfBirth.trim() && ageUnit === "YEARS" && ageValue.trim() ? Number(ageValue) : null
        });
        setPatients((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setStatus("Patient updated.");
      } else {
        const created = await patientsApi.create({
          patientCode,
          name,
          phone: phone.trim() ? phone.trim() : null,
          gender: gender || null,
          dateOfBirth: dateOfBirth.trim() || null,
          ageValue: ageValue.trim() ? Number(ageValue) : null,
          ageUnit: ageValue.trim() || dateOfBirth.trim() ? ageUnit : null,
          ageYears: !dateOfBirth.trim() && ageUnit === "YEARS" && ageValue.trim() ? Number(ageValue) : null
        });
        setPatients((prev) => [created, ...prev]);
        setStatus("Patient registered.");
        resetForm();
      }
    } catch {
      setError("Save failed. Patient code may already exist.");
    } finally {
      setBusy(false);
    }
  };

  const search = async (): Promise<void> => {
    setStatus("");
    await load(q.trim() || undefined);
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Patient registration</h1>
        <p className="page-subtitle">Register patients once, then reuse the Patient Code in Billing and Reports.</p>
      </div>

      <div className="card">
        <h2 className="card-title">{editingId ? "Edit patient" : "Register patient"}</h2>
        {error ? <p className="status-error">{error}</p> : null}
        {status ? <p className="text-muted">{status}</p> : null}

        <form onSubmit={(e) => void submit(e)}>
          <div className="form-grid">
            <label className="form-label">
              Patient code
              <input value={patientCode} onChange={(e) => setPatientCode(e.target.value)} placeholder="e.g. PAT-001" required />
            </label>
            <label className="form-label">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
            </label>
            <label className="form-label">
              Phone (optional)
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
            </label>
            <label className="form-label">
              Gender (optional)
              <select value={gender} onChange={(e) => setGender(e.target.value as PatientGender | "")}>
                <option value="">—</option>
                {genderOptions.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <PatientAgeFields
              dateOfBirth={dateOfBirth}
              ageValue={ageValue}
              ageUnit={ageUnit}
              onDateOfBirthChange={setDateOfBirth}
              onAgeValueChange={setAgeValue}
              onAgeUnitChange={setAgeUnit}
              controlClassName=""
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={busy}>
              {busy ? (editingId ? "Saving…" : "Registering…") : editingId ? "Save changes" : "Register"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} disabled={busy}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Patients</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, name, phone" style={{ flex: 1 }} />
          <button type="button" onClick={() => void search()} disabled={busy}>
            Search
          </button>
          <button type="button" onClick={() => void load()} disabled={busy}>
            Reset
          </button>
        </div>

        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Gender</th>
                <th>Age</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    No patients found.
                  </td>
                </tr>
              ) : (
                patients.map((p) => (
                  <tr key={p.id}>
                    <td>{p.patientCode}</td>
                    <td>{p.name}</td>
                    <td>{p.phone ?? "—"}</td>
                    <td>{p.gender ?? "—"}</td>
                    <td>{formatPatientAge(p) ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" onClick={() => beginEdit(p)} disabled={busy}>
                        Edit
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => setTrajectoryPatientId(p.id)}
                        disabled={busy}
                      >
                        Trajectory
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selected ? (
          <p className="text-muted" style={{ marginTop: 12 }}>
            Editing: <strong>{selected.patientCode}</strong>
          </p>
        ) : null}
      </div>

      {trajectoryPatientId ? (
        <div className="card mt-4">
          <LongitudinalTrajectory
            patientId={trajectoryPatientId}
            {...(() => {
              const patient = patients.find((p) => p.id === trajectoryPatientId);
              return patient?.name ? { patientName: patient.name } : {};
            })()}
          />
        </div>
      ) : null}
    </section>
  );
};

