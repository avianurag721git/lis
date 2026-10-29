import {
  defaultReportLayout,
  moveFieldOrder,
  parseReportLayout
} from "./reportLayout.types";

const assert = (label: string, condition: boolean): void => {
  if (!condition) throw new Error(`FAIL: ${label}`);
};

const d = defaultReportLayout();
assert("defaults load", d.header.fields.length > 0 && d.patient.fields.length > 0 && d.footer.fields.length > 0);

const moved = moveFieldOrder(d.patient.fields, "patientName", "down");
const before = d.patient.fields.find((f) => f.id === "patientName")!.order;
const after = moved.find((f) => f.id === "patientName")!.order;
assert("moveFieldOrder changes order", after !== before || moved !== d.patient.fields);

const parsed = parseReportLayout({
  header: { titleAlign: "left", contactAlign: "right", fields: [{ id: "website", enabled: false, order: 1 }] },
  patient: { columns: 2 },
  footer: { fields: [{ id: "disclaimer", enabled: false, order: 0 }] }
});
assert("titleAlign left", parsed.header.titleAlign === "left");
assert("contactAlign right", parsed.header.contactAlign === "right");
assert("website disabled", parsed.header.fields.find((f) => f.id === "website")?.enabled === false);
assert("disclaimer disabled", parsed.footer.fields.find((f) => f.id === "disclaimer")?.enabled === false);
assert("unknown garbage ignored", parseReportLayout({ foo: 1 }).patient.columns === 3);

console.log("frontend reportLayout.types: all checks passed");
