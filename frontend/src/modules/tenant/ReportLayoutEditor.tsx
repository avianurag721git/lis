import type {
  ReportFooterFieldId,
  ReportHeaderFieldId,
  ReportLayoutConfig,
  ReportLayoutField,
  ReportPatientFieldId,
  ReportSectionFieldId
} from "./reportLayout.types";
import {
  REPORT_FOOTER_FIELD_LABELS,
  REPORT_HEADER_FIELD_LABELS,
  REPORT_PATIENT_FIELD_LABELS,
  REPORT_SECTION_FIELD_LABELS,
  defaultReportLayout,
  moveFieldOrder
} from "./reportLayout.types";

type Props = {
  value: ReportLayoutConfig;
  onChange: (next: ReportLayoutConfig) => void;
};

type FieldRowProps<T extends string> = {
  field: ReportLayoutField<T>;
  label: string;
  groupOptions?: Array<{ value: string; label: string }>;
  onToggle: () => void;
  onOrder: (dir: "up" | "down") => void;
  onGroup?: (group: string) => void;
  onAlign?: (align: "left" | "center" | "right") => void;
};

const FieldRow = <T extends string>({
  field,
  label,
  groupOptions,
  onToggle,
  onOrder,
  onGroup,
  onAlign
}: FieldRowProps<T>): JSX.Element => (
  <div
    className="report-layout-row"
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto auto auto",
      gap: 8,
      alignItems: "center",
      padding: "6px 0",
      borderBottom: "1px solid var(--border-color, #e5e7eb)"
    }}
  >
    <label className="form-label" style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 0 }}>
      <input type="checkbox" checked={field.enabled} onChange={onToggle} />
      <span>{label}</span>
    </label>
    {groupOptions ? (
      <select
        aria-label={`${label} group`}
        value={field.group ?? groupOptions[0]?.value ?? ""}
        onChange={(e) => onGroup?.(e.target.value)}
        disabled={!field.enabled}
        style={{ minWidth: 96 }}
      >
        {groupOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : onAlign ? (
      <select
        aria-label={`${label} alignment`}
        value={field.align ?? "center"}
        onChange={(e) => onAlign(e.target.value as "left" | "center" | "right")}
        disabled={!field.enabled}
        style={{ minWidth: 96 }}
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    ) : (
      <span />
    )}
    <button type="button" className="btn btn-ghost" onClick={() => onOrder("up")} aria-label={`Move ${label} up`}>
      ↑
    </button>
    <button type="button" className="btn btn-ghost" onClick={() => onOrder("down")} aria-label={`Move ${label} down`}>
      ↓
    </button>
  </div>
);

export const ReportLayoutEditor = ({ value, onChange }: Props): JSX.Element => {
  const layout = value ?? defaultReportLayout();

  const patchHeaderField = (
    id: ReportHeaderFieldId,
    patch: Partial<Pick<ReportLayoutField<ReportHeaderFieldId>, "enabled" | "align" | "group" | "order">>
  ): void => {
    onChange({
      ...layout,
      header: {
        ...layout.header,
        fields: layout.header.fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
      }
    });
  };

  const patchPatientField = (
    id: ReportPatientFieldId,
    patch: Partial<Pick<ReportLayoutField<ReportPatientFieldId>, "enabled" | "align" | "group" | "order">>
  ): void => {
    onChange({
      ...layout,
      patient: {
        ...layout.patient,
        fields: layout.patient.fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
      }
    });
  };

  const patchFooterField = (
    id: ReportFooterFieldId,
    patch: Partial<Pick<ReportLayoutField<ReportFooterFieldId>, "enabled" | "align" | "group" | "order">>
  ): void => {
    onChange({
      ...layout,
      footer: {
        ...layout.footer,
        fields: layout.footer.fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
      }
    });
  };

  const patchSectionField = (
    id: ReportSectionFieldId,
    patch: Partial<Pick<ReportLayoutField<ReportSectionFieldId>, "enabled" | "order">>
  ): void => {
    onChange({
      ...layout,
      sections: {
        ...layout.sections,
        fields: (layout.sections?.fields ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f))
      }
    });
  };

  return (
    <div className="report-layout-editor">
      <p className="text-muted" style={{ marginTop: 0 }}>
        Choose which fields appear on printed / PDF reports, their order, and column grouping. Empty values are never
        printed. Changes apply to newly generated reports for this lab only.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label className="form-label" style={{ minWidth: 160 }}>
          Title alignment
          <select
            value={layout.header.titleAlign}
            onChange={(e) =>
              onChange({
                ...layout,
                header: { ...layout.header, titleAlign: e.target.value as "left" | "center" | "right" }
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="form-label" style={{ minWidth: 160 }}>
          Contact line alignment
          <select
            value={layout.header.contactAlign}
            onChange={(e) =>
              onChange({
                ...layout,
                header: { ...layout.header, contactAlign: e.target.value as "left" | "center" | "right" }
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="form-label" style={{ minWidth: 160 }}>
          Patient detail columns
          <select
            value={layout.patient.columns}
            onChange={(e) =>
              onChange({
                ...layout,
                patient: { ...layout.patient, columns: Number(e.target.value) === 2 ? 2 : 3 }
              })
            }
          >
            <option value={3}>3 columns</option>
            <option value={2}>2 columns</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ alignSelf: "end" }}
          onClick={() => onChange(defaultReportLayout())}
        >
          Reset to default layout
        </button>
      </div>

      <h3 className="card-title" style={{ fontSize: "1rem" }}>
        Report header
      </h3>
      {layout.header.fields
        .slice()
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((field) => {
          const rowProps: FieldRowProps<ReportHeaderFieldId> = {
            field,
            label: REPORT_HEADER_FIELD_LABELS[field.id],
            onToggle: () => patchHeaderField(field.id, { enabled: !field.enabled }),
            onOrder: (dir) =>
              onChange({
                ...layout,
                header: { ...layout.header, fields: moveFieldOrder(layout.header.fields, field.id, dir) }
              })
          };
          if (field.group === "center") {
            rowProps.onAlign = (align) => patchHeaderField(field.id, { align });
          }
          return <FieldRow key={field.id} {...rowProps} />;
        })}

      <h3 className="card-title" style={{ fontSize: "1rem", marginTop: 20 }}>
        Patient &amp; sample details
      </h3>
      {layout.patient.fields
        .slice()
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            label={REPORT_PATIENT_FIELD_LABELS[field.id]}
            groupOptions={[
              { value: "left", label: "Left col" },
              { value: "middle", label: "Middle col" },
              { value: "right", label: "Right col" }
            ]}
            onToggle={() => patchPatientField(field.id, { enabled: !field.enabled })}
            onGroup={(group) => patchPatientField(field.id, { group })}
            onOrder={(dir) =>
              onChange({
                ...layout,
                patient: { ...layout.patient, fields: moveFieldOrder(layout.patient.fields, field.id, dir) }
              })
            }
          />
        ))}

      <h3 className="card-title" style={{ fontSize: "1rem", marginTop: 20 }}>
        Report footer
      </h3>
      {layout.footer.fields
        .slice()
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            label={REPORT_FOOTER_FIELD_LABELS[field.id]}
            groupOptions={[
              { value: "banner", label: "Banner" },
              { value: "left", label: "Left block" },
              { value: "right", label: "Right block" },
              { value: "chrome", label: "Page chrome" }
            ]}
            onToggle={() => patchFooterField(field.id, { enabled: !field.enabled })}
            onGroup={(group) => patchFooterField(field.id, { group })}
            onOrder={(dir) =>
              onChange({
                ...layout,
                footer: { ...layout.footer, fields: moveFieldOrder(layout.footer.fields, field.id, dir) }
              })
            }
          />
        ))}

      <h3 className="card-title" style={{ fontSize: "1rem", marginTop: 20 }}>
        Optional sections
      </h3>
      <p className="text-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Smart Patient Summary continues on the same page after the report body when enabled (DETAILED template).
      </p>
      {(layout.sections?.fields ?? [])
        .slice()
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            label={REPORT_SECTION_FIELD_LABELS[field.id]}
            onToggle={() => patchSectionField(field.id, { enabled: !field.enabled })}
            onOrder={(dir) =>
              onChange({
                ...layout,
                sections: {
                  ...layout.sections,
                  fields: moveFieldOrder(layout.sections?.fields ?? [], field.id, dir)
                }
              })
            }
          />
        ))}
    </div>
  );
};
