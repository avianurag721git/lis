import {
  defaultReportLayout,
  isFieldEnabled,
  parseReportLayout,
  sortedEnabled
} from "./reportLayout.types";

const assert = (label: string, condition: boolean): void => {
  if (!condition) throw new Error(`FAIL: ${label}`);
};

const defaults = defaultReportLayout();
assert("default has 3 patient columns", defaults.patient.columns === 3);
assert("default patient name enabled", isFieldEnabled(defaults.patient.fields, "patientName"));
assert("default nabh badge off", !isFieldEnabled(defaults.header.fields, "nabhBadge"));
assert("default qr on", isFieldEnabled(defaults.footer.fields, "qrCode"));
assert("default patient summary off", !isFieldEnabled(defaults.sections.fields, "patientSummary"));

const legacy = parseReportLayout(null);
assert("null layout uses defaults", legacy.header.fields.length === defaults.header.fields.length);
assert("legacy keeps lab name", isFieldEnabled(legacy.header.fields, "labName"));

const partial = parseReportLayout({
  patient: {
    columns: 2,
    fields: [
      { id: "patientName", enabled: false, order: 0, group: "left" },
      { id: "phone", enabled: true, order: 0, group: "right" },
      { id: "unknownField", enabled: true, order: 99 }
    ]
  },
  footer: {
    fields: [{ id: "qrCode", enabled: false, order: 0, group: "left" }]
  }
});
assert("partial columns=2", partial.patient.columns === 2);
assert("partial disables name", !isFieldEnabled(partial.patient.fields, "patientName"));
assert("partial ignores unknown ids", !partial.patient.fields.some((f) => (f.id as string) === "unknownField"));
assert("partial disables qr", !isFieldEnabled(partial.footer.fields, "qrCode"));
assert("partial keeps signature default", isFieldEnabled(partial.footer.fields, "signature"));
assert(
  "partial keeps patient summary default off",
  !isFieldEnabled(partial.sections.fields, "patientSummary")
);

const leftOnly = sortedEnabled(partial.patient.fields, "left");
assert("sortedEnabled filters group", leftOnly.every((f) => f.group === "left"));
assert("disabled name not in sortedEnabled", !leftOnly.some((f) => f.id === "patientName"));

const tenantA = parseReportLayout({
  header: { fields: [{ id: "logo", enabled: false, order: 0, group: "left" }] }
});
const tenantB = parseReportLayout({
  header: { fields: [{ id: "logo", enabled: true, order: 0, group: "left" }] }
});
assert("tenant isolation of layout toggle", isFieldEnabled(tenantA.header.fields, "logo") !== isFieldEnabled(tenantB.header.fields, "logo"));

console.log("reportLayout.types: all checks passed");
