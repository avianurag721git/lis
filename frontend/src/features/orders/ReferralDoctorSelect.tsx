import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, User, ChevronDown } from "lucide-react";
import { Modal } from "../../components/Modal";
import {
  referralDoctorsApi,
  SELF_DOCTOR_CODE,
  type ReferralDoctor
} from "./referralDoctors.service";
import { cn } from "../../lib/utils";

export type ReferralDoctorSelectProps = {
  value: ReferralDoctor | null;
  onChange: (doctor: ReferralDoctor | null) => void;
  /** OCR or external prefill — triggers lookup by name */
  prefillName?: string;
  disabled?: boolean;
};

const formatDoctorLabel = (d: ReferralDoctor): string =>
  d.doctorCode === SELF_DOCTOR_CODE ? d.name : `${d.name} (${d.doctorCode})`;

export const ReferralDoctorSelect = ({
  value,
  onChange,
  prefillName,
  disabled
}: ReferralDoctorSelectProps): JSX.Element => {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [frequent, setFrequent] = useState<ReferralDoctor[]>([]);
  const [results, setResults] = useState<ReferralDoctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [quickName, setQuickName] = useState("");
  const [quickMobile, setQuickMobile] = useState("");
  const [quickClinic, setQuickClinic] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const doctors = await referralDoctorsApi.frequent();
        setFrequent(doctors);
        if (!initializedRef.current && !value) {
          const self = doctors.find((d) => d.doctorCode === SELF_DOCTOR_CODE);
          if (self) onChange(self);
          initializedRef.current = true;
        }
      } catch {
        setFrequent([]);
      }
    })();
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!prefillName?.trim()) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const doctors = await referralDoctorsApi.search(prefillName.trim());
          if (doctors[0]) onChange(doctors[0]);
        } catch {
          /* ignore */
        }
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [prefillName, onChange]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const doctors = await referralDoctorsApi.search(trimmed);
          setResults(doctors);
          setHighlight(0);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, trimmed.length >= 1 ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const displayValue = value ? formatDoctorLabel(value) : "";

  const frequentFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = frequent.filter((d) => d.doctorCode !== SELF_DOCTOR_CODE);
    if (!q) return base.slice(0, 5);
    return base
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.doctorCode.toLowerCase().includes(q) ||
          (d.mobile ?? "").includes(q)
      )
      .slice(0, 5);
  }, [frequent, query]);

  const listItems = useMemo(() => {
    const q = query.trim();
    const merged = q.length >= 1 ? results : frequentFiltered;
    const seen = new Set<string>();
    return merged.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [query, results, frequentFiltered]);

  const selectDoctor = (doctor: ReferralDoctor): void => {
    onChange(doctor);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const selectSelf = (): void => {
    const self = frequent.find((d) => d.doctorCode === SELF_DOCTOR_CODE);
    if (self) selectDoctor(self);
    else {
      void referralDoctorsApi.search("Self").then((docs) => {
        const found = docs.find((d) => d.doctorCode === SELF_DOCTOR_CODE);
        if (found) selectDoctor(found);
      });
    }
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, listItems.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (highlight === listItems.length) {
        setQuickAddOpen(true);
        setQuickName(query.trim());
        return;
      }
      const picked = listItems[highlight];
      if (picked) selectDoctor(picked);
    }
  };

  const submitQuickAdd = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setQuickBusy(true);
    setQuickError("");
    try {
      const trimmedMobile = quickMobile.trim();
      const trimmedClinic = quickClinic.trim();
      const doctor = await referralDoctorsApi.quickAdd({
        name: quickName.trim(),
        ...(trimmedMobile ? { mobile: trimmedMobile } : {}),
        ...(trimmedClinic ? { clinicName: trimmedClinic } : {})
      });
      setFrequent((prev) => [doctor, ...prev.filter((d) => d.id !== doctor.id)]);
      selectDoctor(doctor);
      setQuickAddOpen(false);
      setQuickName("");
      setQuickMobile("");
      setQuickClinic("");
    } catch {
      setQuickError("Could not add doctor. Check name and try again.");
    } finally {
      setQuickBusy(false);
    }
  };

  const isSelfSelected = value?.doctorCode === SELF_DOCTOR_CODE;

  return (
    <div className="referral-doctor-select" ref={rootRef}>
      <div className="referral-doctor-select__head">
        <span className="form-label referral-doctor-select__label">Referral doctor</span>
        <button
          type="button"
          className={cn("referral-doctor-chip", isSelfSelected && "referral-doctor-chip--active")}
          onClick={selectSelf}
          disabled={disabled}
        >
          <User size={14} aria-hidden />
          Self / Direct
        </button>
      </div>

      <div className={cn("referral-combobox", open && "referral-combobox--open")}>
        <div className="referral-combobox__control">
          <input
            ref={inputRef}
            id={listId}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-listbox`}
            aria-autocomplete="list"
            className="form-control referral-combobox__input"
            value={open ? query : displayValue}
            placeholder="Search name, DOC-104, or mobile…"
            disabled={disabled}
            onFocus={() => {
              setOpen(true);
              setQuery("");
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
          />
          <ChevronDown size={16} className="referral-combobox__chevron" aria-hidden />
        </div>

        {open ? (
          <ul
            id={`${listId}-listbox`}
            role="listbox"
            className="referral-combobox__list"
            onMouseDown={(e) => e.preventDefault()}
          >
            {!query.trim() && frequentFiltered.length > 0 ? (
              <li className="referral-combobox__section" aria-hidden>
                Frequently selected
              </li>
            ) : null}

            {loading ? <li className="referral-combobox__empty">Searching…</li> : null}

            {!loading && listItems.length === 0 ? (
              <li className="referral-combobox__empty">No doctors found</li>
            ) : null}

            {listItems.map((d, idx) => (
              <li key={d.id} role="option" aria-selected={value?.id === d.id}>
                <button
                  type="button"
                  className={cn(
                    "referral-combobox__option",
                    highlight === idx && "referral-combobox__option--active",
                    value?.id === d.id && "referral-combobox__option--selected"
                  )}
                  onClick={() => selectDoctor(d)}
                >
                  <span className="referral-combobox__option-main">
                    <strong>{d.name}</strong>
                    <span className="referral-combobox__code">{d.doctorCode}</span>
                  </span>
                  <span className="referral-combobox__option-meta">
                    {d.specialization ? <span>{d.specialization}</span> : null}
                    {d.clinicName ? <span className="referral-combobox__clinic">{d.clinicName}</span> : null}
                  </span>
                </button>
              </li>
            ))}

            <li role="option" aria-selected={false}>
              <button
                type="button"
                className={cn(
                  "referral-combobox__option referral-combobox__option--add",
                  highlight === listItems.length && "referral-combobox__option--active"
                )}
                onClick={() => {
                  setQuickAddOpen(true);
                  setQuickName(query.trim());
                }}
              >
                <Plus size={16} aria-hidden />
                Add new doctor
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      {value && value.doctorCode !== SELF_DOCTOR_CODE ? (
        <p className="order-booking-hint text-muted">
          {value.clinicName ? `${value.clinicName} · ` : ""}
          {value.mobile ?? "No mobile on file"}
          {value.commissionPercentage > 0 ? ` · Commission ${value.commissionPercentage}%` : ""}
        </p>
      ) : null}

      <Modal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        title="Quick add referral doctor"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setQuickAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="quick-add-doctor-form" className="btn btn-primary" disabled={quickBusy}>
              {quickBusy ? "Saving…" : "Save & select"}
            </button>
          </>
        }
      >
        <form id="quick-add-doctor-form" onSubmit={(e) => void submitQuickAdd(e)} className="stack-form">
          <label className="form-label">
            Doctor name
            <input
              className="form-control"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="Dr. Rajesh Sharma, MD"
              required
              autoFocus
            />
          </label>
          <label className="form-label">
            Mobile
            <input
              className="form-control"
              value={quickMobile}
              onChange={(e) => setQuickMobile(e.target.value)}
              placeholder="10-digit mobile"
            />
          </label>
          <label className="form-label">
            Clinic name
            <input
              className="form-control"
              value={quickClinic}
              onChange={(e) => setQuickClinic(e.target.value)}
              placeholder="Sharma Clinic"
            />
          </label>
          {quickError ? <p className="status-error">{quickError}</p> : null}
        </form>
      </Modal>
    </div>
  );
};
