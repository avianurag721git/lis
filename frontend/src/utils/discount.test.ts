import {
  computeDiscountMinor,
  computeReferralCommissionMinor,
  discountPercentOfSubtotal
} from "./discount";

const assert = (label: string, condition: boolean): void => {
  if (!condition) throw new Error(`FAIL: ${label}`);
};

// amount discount
assert("amount 50 on 1000", computeDiscountMinor(100000, "amount", 50) === 5000);
assert("amount capped at subtotal", computeDiscountMinor(100000, "amount", 2000) === 100000);

// percent discount
assert("10% of 1000", computeDiscountMinor(100000, "percent", 10) === 10000);
assert("percent capped at 100", computeDiscountMinor(100000, "percent", 150) === 100000);

// percent of subtotal round-trip
assert(
  "percent round-trip",
  discountPercentOfSubtotal(100000, computeDiscountMinor(100000, "percent", 12.5)) === 12.5
);

// referral commission on taxable base
assert("commission 10%", computeReferralCommissionMinor(90000, 10) === 9000);
assert("commission 0%", computeReferralCommissionMinor(90000, 0) === 0);

console.log("discount utils: all checks passed");
