/**
 * Tenant-scoped lab report layout (header / patient box / footer).
 * Stored inside saas_tenants.branding JSON — no schema migration required.
 */

export type ReportFieldAlign = "left" | "center" | "right";

export type ReportHeaderFieldId =
  | "logo"
  | "nablBadge"
  | "nabhBadge"
  | "barcode"
  | "labName"
  | "accreditationLine"
  | "address"
  | "phone"
  | "email"
  | "website";

export type ReportPatientFieldId =
  | "patientName"
  | "dob"
  | "ageGender"
  | "patientId"
  | "labId"
  | "status"
  | "referredBy"
  | "collectedAt"
  | "receivedAt"
  | "reportedAt"
  | "sampleQuality"
  | "phone";

export type ReportPatientColumn = "left" | "middle" | "right";

export type ReportFooterFieldId =
  | "endOfReport"
  | "qrCode"
  | "qrCaption"
  | "pathologistName"
  | "pathologistDesignation"
  | "signature"
  | "comments"
  | "processedAt"
  | "pageNumber"
  | "hlLegend"
  | "disclaimer";

export type ReportSectionFieldId = "patientSummary";

export type ReportFooterGroup = "banner" | "left" | "right" | "chrome";

export type ReportLayoutField<T extends string> = {
  id: T;
  enabled: boolean;
  order: number;
  align?: ReportFieldAlign;
  /** Patient box column or footer region */
  group?: ReportPatientColumn | ReportFooterGroup | string;
};

export type ReportLayoutConfig = {
  header: {
    fields: ReportLayoutField<ReportHeaderFieldId>[];
    titleAlign: ReportFieldAlign;
    contactAlign: ReportFieldAlign;
  };
  patient: {
    fields: ReportLayoutField<ReportPatientFieldId>[];
    columns: 2 | 3;
  };
  footer: {
    fields: ReportLayoutField<ReportFooterFieldId>[];
  };
  /** Optional body sections after results / signatures (same page flow). */
  sections: {
    fields: ReportLayoutField<ReportSectionFieldId>[];
  };
};

const HEADER_DEFAULTS: ReportLayoutField<ReportHeaderFieldId>[] = [
  { id: "logo", enabled: true, order: 0, group: "left" },
  { id: "nablBadge", enabled: true, order: 1, group: "left" },
  { id: "nabhBadge", enabled: false, order: 2, group: "left" },
  { id: "barcode", enabled: true, order: 0, group: "right" },
  { id: "labName", enabled: true, order: 0, align: "center", group: "center" },
  { id: "accreditationLine", enabled: true, order: 1, align: "center", group: "center" },
  { id: "address", enabled: true, order: 2, align: "center", group: "center" },
  { id: "phone", enabled: true, order: 3, align: "center", group: "center" },
  { id: "email", enabled: true, order: 4, align: "center", group: "center" },
  { id: "website", enabled: true, order: 5, align: "center", group: "center" }
];

const PATIENT_DEFAULTS: ReportLayoutField<ReportPatientFieldId>[] = [
  { id: "patientName", enabled: true, order: 0, group: "left" },
  { id: "dob", enabled: true, order: 0, group: "middle" },
  { id: "ageGender", enabled: true, order: 0, group: "right" },
  { id: "patientId", enabled: true, order: 1, group: "left" },
  { id: "labId", enabled: true, order: 1, group: "middle" },
  { id: "status", enabled: true, order: 1, group: "right" },
  { id: "referredBy", enabled: true, order: 2, group: "left" },
  { id: "collectedAt", enabled: true, order: 2, group: "middle" },
  { id: "receivedAt", enabled: true, order: 2, group: "right" },
  { id: "reportedAt", enabled: true, order: 3, group: "left" },
  { id: "sampleQuality", enabled: true, order: 3, group: "middle" },
  { id: "phone", enabled: true, order: 3, group: "right" }
];

const FOOTER_DEFAULTS: ReportLayoutField<ReportFooterFieldId>[] = [
  { id: "endOfReport", enabled: true, order: 0, group: "banner", align: "center" },
  { id: "qrCode", enabled: true, order: 0, group: "left" },
  { id: "qrCaption", enabled: true, order: 1, group: "left" },
  { id: "pathologistDesignation", enabled: true, order: 0, group: "right" },
  { id: "pathologistName", enabled: true, order: 1, group: "right" },
  { id: "signature", enabled: true, order: 2, group: "right" },
  { id: "comments", enabled: true, order: 3, group: "right" },
  { id: "processedAt", enabled: true, order: 0, group: "chrome" },
  { id: "pageNumber", enabled: true, order: 1, group: "chrome" },
  { id: "hlLegend", enabled: true, order: 2, group: "chrome" },
  { id: "disclaimer", enabled: true, order: 3, group: "chrome" }
];

const SECTION_DEFAULTS: ReportLayoutField<ReportSectionFieldId>[] = [
  // Off by default — enable from Tenant Settings → Report layout
  { id: "patientSummary", enabled: false, order: 0 }
];

export const defaultReportLayout = (): ReportLayoutConfig => ({
  header: {
    fields: HEADER_DEFAULTS.map((f) => ({ ...f })),
    titleAlign: "center",
    contactAlign: "center"
  },
  patient: {
    fields: PATIENT_DEFAULTS.map((f) => ({ ...f })),
    columns: 3
  },
  footer: {
    fields: FOOTER_DEFAULTS.map((f) => ({ ...f }))
  },
  sections: {
    fields: SECTION_DEFAULTS.map((f) => ({ ...f }))
  }
});

const HEADER_IDS = new Set(HEADER_DEFAULTS.map((f) => f.id));
const PATIENT_IDS = new Set(PATIENT_DEFAULTS.map((f) => f.id));
const FOOTER_IDS = new Set(FOOTER_DEFAULTS.map((f) => f.id));
const SECTION_IDS = new Set(SECTION_DEFAULTS.map((f) => f.id));

const isAlign = (v: unknown): v is ReportFieldAlign => v === "left" || v === "center" || v === "right";

const mergeFields = <T extends string>(
  defaults: ReportLayoutField<T>[],
  allowed: Set<string>,
  raw: unknown
): ReportLayoutField<T>[] => {
  const byId = new Map(defaults.map((f) => [f.id, { ...f }]));
  if (!Array.isArray(raw)) return defaults.map((f) => ({ ...f }));

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    if (typeof id !== "string" || !allowed.has(id)) continue;
    const base = byId.get(id as T) ?? ({ id: id as T, enabled: true, order: 0 } as ReportLayoutField<T>);
    byId.set(id as T, {
      ...base,
      enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? Math.floor(row.order) : base.order,
      ...(isAlign(row.align) ? { align: row.align } : base.align ? { align: base.align } : {}),
      ...(typeof row.group === "string" && row.group.trim()
        ? { group: row.group.trim() }
        : base.group
          ? { group: base.group }
          : {})
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
};

/** Merge partial / legacy layout JSON with defaults. Never throws. */
export const parseReportLayout = (raw: unknown): ReportLayoutConfig => {
  const defaults = defaultReportLayout();
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  const headerRaw = r.header && typeof r.header === "object" ? (r.header as Record<string, unknown>) : {};
  const patientRaw = r.patient && typeof r.patient === "object" ? (r.patient as Record<string, unknown>) : {};
  const footerRaw = r.footer && typeof r.footer === "object" ? (r.footer as Record<string, unknown>) : {};
  const sectionsRaw = r.sections && typeof r.sections === "object" ? (r.sections as Record<string, unknown>) : {};

  const columns = patientRaw.columns === 2 ? 2 : 3;

  return {
    header: {
      fields: mergeFields(HEADER_DEFAULTS, HEADER_IDS, headerRaw.fields),
      titleAlign: isAlign(headerRaw.titleAlign) ? headerRaw.titleAlign : defaults.header.titleAlign,
      contactAlign: isAlign(headerRaw.contactAlign) ? headerRaw.contactAlign : defaults.header.contactAlign
    },
    patient: {
      fields: mergeFields(PATIENT_DEFAULTS, PATIENT_IDS, patientRaw.fields),
      columns
    },
    footer: {
      fields: mergeFields(FOOTER_DEFAULTS, FOOTER_IDS, footerRaw.fields)
    },
    sections: {
      fields: mergeFields(SECTION_DEFAULTS, SECTION_IDS, sectionsRaw.fields)
    }
  };
};

export const isFieldEnabled = <T extends string>(
  fields: ReportLayoutField<T>[],
  id: T
): boolean => fields.find((f) => f.id === id)?.enabled !== false;

export const sortedEnabled = <T extends string>(
  fields: ReportLayoutField<T>[],
  group?: string
): ReportLayoutField<T>[] =>
  fields
    .filter((f) => f.enabled)
    .filter((f) => (group == null ? true : (f.group ?? "") === group))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

export const REPORT_HEADER_FIELD_LABELS: Record<ReportHeaderFieldId, string> = {
  logo: "Lab logo",
  nablBadge: "NABL badge",
  nabhBadge: "NABH badge",
  barcode: "Order barcode",
  labName: "Lab name",
  accreditationLine: "Accreditation / affiliation",
  address: "Address",
  phone: "Phone",
  email: "Email",
  website: "Website"
};

export const REPORT_PATIENT_FIELD_LABELS: Record<ReportPatientFieldId, string> = {
  patientName: "Patient name",
  dob: "Date of birth",
  ageGender: "Age / gender",
  patientId: "Patient ID",
  labId: "Lab ID",
  status: "Report status",
  referredBy: "Referring doctor",
  collectedAt: "Collected",
  receivedAt: "Received",
  reportedAt: "Reported",
  sampleQuality: "Sample quality",
  phone: "Phone"
};

export const REPORT_FOOTER_FIELD_LABELS: Record<ReportFooterFieldId, string> = {
  endOfReport: "End of report banner",
  qrCode: "QR code",
  qrCaption: "QR caption / verify link",
  pathologistName: "Pathologist name",
  pathologistDesignation: "Pathologist designation",
  signature: "Digital signature",
  comments: "Comments note",
  processedAt: "Processed-at label",
  pageNumber: "Page number",
  hlLegend: "H/L legend",
  disclaimer: "Disclaimer"
};

export const REPORT_SECTION_FIELD_LABELS: Record<ReportSectionFieldId, string> = {
  patientSummary: "Smart Patient Summary (continues on same page)"
};
