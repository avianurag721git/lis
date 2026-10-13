import { useMemo, useState } from "react";
import { formatLabelKey } from "../../utils/formatLabel";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ControlSampleResult } from "./inventory.service";

type Props = {
  points: ControlSampleResult[];
  bands: Record<string, number> | null;
  instrumentHint?: string;
};

const correctiveFor = (rule: string | null, instrument?: string): string => {
  const analyzer = instrument || "the analyzer";
  switch (rule) {
    case "1-3s":
      return `Recalibrate ${analyzer} channel; repeat Level controls before releasing patient results.`;
    case "2-2s":
      return `Systematic bias — recalibrate ${analyzer}, check reagent lot / calibrator, then run calibration pass.`;
    case "R-4s":
      return `Random error on ${analyzer} — inspect probes, rinse, recalibrate, then log calibration pass.`;
    case "4-1s":
      return `Drift warning on ${analyzer} — verify calibration curve and reagent integrity.`;
    case "10x":
      return `Shift warning on ${analyzer} — review mean/SD targets and recalibrate if confirmed.`;
    case "1-2s":
      return `Warning only — monitor next control; no patient release block yet.`;
    default:
      return "Control within acceptable limits.";
  }
};

const pointColor = (p: ControlSampleResult): string => {
  if (p.isReject || p.status === "REJECTED") return "#b91c1c";
  if (p.status === "WARNING" || p.westgardFlags.includes("1-2s")) return "#d97706";
  return "#15803d";
};

export const LeveyJenningsChart = ({ points, bands, instrumentHint }: Props): JSX.Element => {
  const [selected, setSelected] = useState<ControlSampleResult | null>(null);

  const data = useMemo(
    () =>
      points.map((p, i) => ({
        idx: i + 1,
        label: new Date(p.runDate).toLocaleDateString(),
        value: p.observedValue,
        fill: pointColor(p),
        point: p
      })),
    [points]
  );

  if (!points.length || !bands) {
    return <p className="text-muted">No QC points yet — record a control run to build the L-J chart.</p>;
  }

  return (
    <div className="lj-layout">
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="idx" label={{ value: "Run #", position: "insideBottom", offset: -2 }} />
            <YAxis domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v) => [typeof v === "number" ? v.toFixed(3) : v, "Observed"]}
              labelFormatter={(idx) => {
                const row = data.find((d) => d.idx === idx);
                return row?.label ?? String(idx);
              }}
            />
            <Legend />
            <ReferenceLine y={bands.mean ?? 0} stroke="#111827" strokeWidth={2} label="Mean" />
            <ReferenceLine y={bands.plus1sd ?? 0} stroke="#2563eb" strokeDasharray="4 4" label="+1SD" />
            <ReferenceLine y={bands.minus1sd ?? 0} stroke="#2563eb" strokeDasharray="4 4" label="-1SD" />
            <ReferenceLine y={bands.plus2sd ?? 0} stroke="#d97706" strokeDasharray="4 4" label="+2SD" />
            <ReferenceLine y={bands.minus2sd ?? 0} stroke="#d97706" strokeDasharray="4 4" label="-2SD" />
            <ReferenceLine y={bands.plus3sd ?? 0} stroke="#b91c1c" strokeDasharray="2 2" label="+3SD" />
            <ReferenceLine y={bands.minus3sd ?? 0} stroke="#b91c1c" strokeDasharray="2 2" label="-3SD" />
            <Line type="monotone" dataKey="value" name="Control" stroke="#0f766e" strokeWidth={2} dot={false} connectNulls={true} />
            <Scatter
              dataKey="value"
              name="Runs"
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null) return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill={payload.fill}
                    stroke="#fff"
                    strokeWidth={1}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(payload.point as ControlSampleResult)}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {selected ? (
        <aside className="qc-violation-drawer">
          <div className="wallet-badge-row">
            <h3 className="card-title" style={{ margin: 0, fontSize: 15 }}>
              QC alert
            </h3>
            <button type="button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p>
            <strong>{new Date(selected.runDate).toLocaleString()}</strong> · {formatLabelKey(selected.controlLevel)}
          </p>
          <p>
            Observed <strong>{selected.observedValue}</strong> (z={selected.zScore ?? "—"})
          </p>
          <p>
            Status:{" "}
            <span
              className={
                selected.status === "REJECTED"
                  ? "badge-danger"
                  : selected.status === "WARNING"
                    ? "badge-warn"
                    : "badge-ok"
              }
            >
              {formatLabelKey(selected.status)}
            </span>
          </p>
          <p>
            Rule breached: <strong>{(selected.violatedRule ?? selected.westgardFlags.join(", ")) || "none"}</strong>
          </p>
          <p className="text-muted">
            {correctiveFor(
              selected.violatedRule ?? selected.westgardFlags[0] ?? null,
              selected.instrumentCode ?? instrumentHint
            )}
          </p>
          {selected.isReject ? (
            <p className="text-danger">
              Instrument is out of calibration until a successful calibration is recorded.
            </p>
          ) : null}
        </aside>
      ) : (
        <p className="text-muted" style={{ fontSize: 12 }}>
          Click a data point for QC rule details and recommended corrective action.
        </p>
      )}
    </div>
  );
};
