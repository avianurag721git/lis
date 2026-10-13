import { useEffect, useState, type InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
  /** Value reported when the field is cleared. Default 0. */
  emptyValue?: number;
};

/**
 * Controlled number input that allows clearing the field while typing.
 * Avoids the sticky leading "0" from `value={n}` + `Number(raw) || 0`.
 */
export function NumberField({
  value,
  onValueChange,
  emptyValue = 0,
  className,
  onBlur,
  onFocus,
  ...rest
}: Props): JSX.Element {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      {...rest}
      type="number"
      className={cn(className)}
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        setDraft(String(value));
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
          onValueChange(emptyValue);
          return;
        }
        const n = Number(raw);
        if (!Number.isNaN(n)) onValueChange(n);
      }}
    />
  );
}
