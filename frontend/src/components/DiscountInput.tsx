import { DiscountType, computeDiscountMinor, discountPercentOfSubtotal } from "../utils/discount";
import { cn } from "../lib/utils";
import { NumberField } from "./NumberField";

type Props = {
  subtotalMinor: number;
  type: DiscountType;
  value: number;
  onTypeChange: (type: DiscountType) => void;
  onValueChange: (value: number) => void;
  maxPercent?: number;
  disabled?: boolean;
  className?: string;
};

export const DiscountInput = ({
  subtotalMinor,
  type,
  value,
  onTypeChange,
  onValueChange,
  maxPercent,
  disabled,
  className
}: Props): JSX.Element => {
  const discountMinor = computeDiscountMinor(subtotalMinor, type, value);
  const effectivePct = discountPercentOfSubtotal(subtotalMinor, discountMinor);
  const exceedsMax = maxPercent != null && effectivePct > maxPercent + 0.001;

  const switchType = (next: DiscountType): void => {
    if (next === type) return;
    if (next === "percent") {
      onValueChange(Math.round(effectivePct * 10) / 10);
    } else {
      onValueChange(discountMinor / 100);
    }
    onTypeChange(next);
  };

  return (
    <div className={cn("discount-input", className)}>
      <span className="form-label discount-input__label">Discount</span>
      <div className="discount-input__segments" role="group" aria-label="Discount type">
        <button
          type="button"
          className={cn("discount-input__seg", type === "amount" && "is-active")}
          onClick={() => switchType("amount")}
          disabled={disabled}
          aria-pressed={type === "amount"}
        >
          Amount (₹)
        </button>
        <button
          type="button"
          className={cn("discount-input__seg", type === "percent" && "is-active")}
          onClick={() => switchType("percent")}
          disabled={disabled}
          aria-pressed={type === "percent"}
        >
          Percent (%)
        </button>
      </div>
      <div className="discount-input__field-wrap">
        {type === "amount" ? <span className="discount-input__affix">₹</span> : null}
        <NumberField
          key={type}
          className="form-control discount-input__field"
          min={0}
          step={type === "percent" ? 0.1 : 1}
          max={type === "percent" ? 100 : undefined}
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          aria-label={type === "percent" ? "Discount percent" : "Discount amount in rupees"}
          placeholder="0"
        />
        {type === "percent" ? <span className="discount-input__affix discount-input__affix--suffix">%</span> : null}
      </div>
      <span className={exceedsMax ? "discount-input__hint discount-input__hint--danger" : "discount-input__hint"}>
        {type === "percent"
          ? `Saves ₹${(discountMinor / 100).toFixed(2)} on this bill`
          : `${effectivePct.toFixed(1)}% of subtotal`}
        {maxPercent != null ? ` · max ${maxPercent}%` : ""}
        {exceedsMax ? " · needs manager approval" : ""}
      </span>
    </div>
  );
};
