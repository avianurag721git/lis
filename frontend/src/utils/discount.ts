export type DiscountType = "amount" | "percent";

export const computeDiscountMinor = (
  subtotalMinor: number,
  type: DiscountType,
  value: number
): number => {
  if (subtotalMinor <= 0 || value <= 0) return 0;

  if (type === "percent") {
    const pct = Math.max(0, Math.min(100, value));
    return Math.round((subtotalMinor * pct) / 100);
  }

  return Math.min(subtotalMinor, Math.round(value * 100));
};

export const discountPercentOfSubtotal = (subtotalMinor: number, discountMinor: number): number => {
  if (subtotalMinor <= 0) return 0;
  return (discountMinor / subtotalMinor) * 100;
};

export const computeReferralCommissionMinor = (
  baseMinor: number,
  commissionPercentage: number
): number => {
  if (baseMinor <= 0 || commissionPercentage <= 0) return 0;
  return Math.round((baseMinor * commissionPercentage) / 100);
};
