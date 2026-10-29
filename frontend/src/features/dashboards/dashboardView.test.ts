import { defaultViewForRole } from "./dashboardView";

const assert = (label: string, condition: boolean): void => {
  if (!condition) throw new Error(`FAIL: ${label}`);
};

assert("LAB_MANAGER → executive", defaultViewForRole("LAB_MANAGER") === "executive");
assert("TENANT_ADMIN → executive", defaultViewForRole("TENANT_ADMIN") === "executive");
assert("SUPER_ADMIN → executive", defaultViewForRole("SUPER_ADMIN") === "executive");
assert("PATHOLOGIST → pathologist", defaultViewForRole("PATHOLOGIST") === "pathologist");
assert("MANAGER legacy → pathologist", defaultViewForRole("MANAGER") === "pathologist");
assert("B2B → b2b", defaultViewForRole("B2B_FRANCHISEE") === "b2b");
assert("LAB_TECH → ops", defaultViewForRole("LAB_TECH") === "ops");
assert("PHLEBOTOMIST → ops", defaultViewForRole("PHLEBOTOMIST") === "ops");

console.log("dashboardView defaults: all checks passed");
