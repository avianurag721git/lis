/**
 * Prevent mouse-wheel from changing focused number/select/date inputs while scrolling.
 * Without this, wheel over a focused field increments the value instead of scrolling the page.
 */
const WHEEL_SENSITIVE_INPUT_TYPES = new Set([
  "number",
  "range",
  "date",
  "time",
  "datetime-local",
  "month",
  "week"
]);

const isWheelSensitiveField = (el: Element | null): el is HTMLInputElement | HTMLSelectElement => {
  if (!el) return false;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return WHEEL_SENSITIVE_INPUT_TYPES.has(el.type);
  }
  return false;
};

let installed = false;

export const installInputScrollGuard = (): void => {
  if (installed || typeof document === "undefined") return;
  installed = true;

  document.addEventListener(
    "wheel",
    (event) => {
      const active = document.activeElement;
      if (!isWheelSensitiveField(active)) return;

      // Blur before the browser applies wheel to the control (capture phase).
      active.blur();
      // Ensure value does not change on this wheel tick (Chrome number inputs).
      event.preventDefault();
    },
    { capture: true, passive: false }
  );
};
