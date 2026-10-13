import { AGE_UNIT_OPTIONS, AgeUnit, ageFromDateOfBirth, maxForAgeUnit, toIsoDateLocal } from "../utils/patientAge";

type Props = {
  dateOfBirth: string;
  ageValue: string;
  ageUnit: AgeUnit;
  onDateOfBirthChange: (value: string) => void;
  onAgeValueChange: (value: string) => void;
  onAgeUnitChange: (value: AgeUnit) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  controlClassName?: string;
};

export const PatientAgeFields = ({
  dateOfBirth,
  ageValue,
  ageUnit,
  onDateOfBirthChange,
  onAgeValueChange,
  onAgeUnitChange,
  required = false,
  disabled = false,
  className = "patient-age-fields",
  controlClassName = "form-control"
}: Props): JSX.Element => {
  const derived = dateOfBirth ? ageFromDateOfBirth(dateOfBirth) : null;
  const displayValue = derived ? String(derived.value) : ageValue;
  const displayUnit = derived ? derived.unit : ageUnit;
  const ageLocked = Boolean(dateOfBirth);
  const maxDob = toIsoDateLocal(new Date());

  return (
    <div className={className}>
      <label className="form-label">
        Date of birth
        <input
          className={controlClassName}
          type="date"
          max={maxDob}
          value={dateOfBirth}
          onChange={(e) => {
            const next = e.target.value;
            onDateOfBirthChange(next);
            const parts = next ? ageFromDateOfBirth(next) : null;
            if (parts) {
              onAgeValueChange(String(parts.value));
              onAgeUnitChange(parts.unit);
            }
          }}
          disabled={disabled}
        />
      </label>
      <label className="form-label" htmlFor="patient-age-value">
        Age
        <span className="patient-age-combo">
          <input
            id="patient-age-value"
            className={controlClassName}
            type="number"
            min={0}
            max={maxForAgeUnit(displayUnit)}
            value={displayValue}
            onChange={(e) => onAgeValueChange(e.target.value)}
            placeholder={displayUnit === "DAYS" ? "e.g. 5" : displayUnit === "MONTHS" ? "e.g. 6" : "e.g. 32"}
            required={required}
            disabled={disabled || ageLocked}
          />
          <select
            className={controlClassName}
            value={displayUnit}
            onChange={(e) => onAgeUnitChange(e.target.value as AgeUnit)}
            aria-label="Age unit"
            disabled={disabled || ageLocked}
          >
            {AGE_UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      <p className="patient-age-hint text-muted">
        {ageLocked
          ? "Age is calculated from date of birth (days for newborns, months for infants, years thereafter)."
          : "Prefer date of birth. If unknown, enter age in days, months, or years — for a 5-day-old, use 5 Days."}
      </p>
    </div>
  );
};
