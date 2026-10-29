import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Activity, TrendingUp } from "lucide-react";
import { longitudinalApi, LongitudinalParameterSeries } from "./longitudinal.service";

const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric", day: "numeric" });

type Props = {
  patientId: string;
  patientName?: string;
};

export const LongitudinalTrajectory = ({ patientId, patientName }: Props): JSX.Element => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["longitudinal-history", patientId],
    queryFn: () => longitudinalApi.getHistory(patientId),
    enabled: Boolean(patientId)
  });

  const numericSeries = useMemo(
    () => (data?.parameters ?? []).filter((p) => p.dataPoints.some((d) => d.value != null)),
    [data]
  );

  const activeIds = selectedIds.length > 0 ? selectedIds : numericSeries.slice(0, 2).map((p) => p.parameterId);

  const toggleParameter = (id: string): void => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, unknown>>();
    for (const series of numericSeries.filter((p) => activeIds.includes(p.parameterId))) {
      for (const point of series.dataPoints) {
        if (point.value == null) continue;
        const key = point.date.slice(0, 10);
        const row = dateMap.get(key) ?? { date: key, dateLabel: formatDate(point.date) };
        row[series.parameterId] = point.value;
        row[`${series.parameterId}_abnormal`] = point.isAbnormal;
        dateMap.set(key, row);
      }
    }
    return [...dateMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [numericSeries, activeIds]);

  const primarySeries: LongitudinalParameterSeries | undefined = numericSeries.find((p) =>
    activeIds.includes(p.parameterId)
  );

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading longitudinal history…</p>;
  }

  if (error) {
    return <p className="text-destructive text-sm">Unable to load lab history for this patient.</p>;
  }

  if (numericSeries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No verified numeric results yet — trajectory charts appear after pathologist-approved reports.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
            Longitudinal health trajectory
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {patientName ?? data?.patient.name} — multi-year parameter trends vs reference bands
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Select up to 3 parameters</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {numericSeries.map((p) => {
          const active = activeIds.includes(p.parameterId);
          return (
            <button
              key={p.parameterId}
              type="button"
              onClick={() => toggleParameter(p.parameterId)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {p.parameterName}
              {p.unit ? ` (${p.unit})` : ""}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8
              }}
            />
            <Legend />
            {primarySeries?.referenceMin != null && primarySeries.referenceMax != null ? (
              <ReferenceArea
                y1={primarySeries.referenceMin}
                y2={primarySeries.referenceMax}
                label={{ value: "Normal range", position: "insideTopLeft", fill: "#16a34a", fontSize: 11 }}
                // Recharts 3 SVG prop filtering omits fill from ReferenceArea typings; still applied at runtime.
                {...({ fill: "#22c55e", fillOpacity: 0.12, strokeOpacity: 0 } as object)}
              />
            ) : null}
            {numericSeries
              .filter((p) => activeIds.includes(p.parameterId))
              .map((p, idx) => (
                <Line
                  key={p.parameterId}
                  type="monotone"
                  dataKey={p.parameterId}
                  name={`${p.parameterName}${p.unit ? ` (${p.unit})` : ""}`}
                  stroke={CHART_COLORS[idx % CHART_COLORS.length] ?? "#000"}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls={true}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {numericSeries
          .filter((p) => activeIds.includes(p.parameterId))
          .map((p) => {
            const latest = p.dataPoints.filter((d) => d.value != null).at(-1);
            const earliest = p.dataPoints.filter((d) => d.value != null).at(0);
            const delta =
              latest?.value != null && earliest?.value != null ? latest.value - earliest.value : null;
            return (
              <div key={p.parameterId} className="card p-4">
                <p className="font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" aria-hidden />
                  {p.parameterName}
                </p>
                <p className="text-2xl font-semibold mt-2">
                  {latest?.value ?? "—"}
                  {p.unit ? <span className="text-sm font-normal text-muted-foreground ml-1">{p.unit}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Latest: {latest ? formatDate(latest.date) : "—"}
                  {p.referenceMin != null && p.referenceMax != null
                    ? ` · Ref ${p.referenceMin}–${p.referenceMax}`
                    : ""}
                </p>
                {delta != null ? (
                  <p className={`text-xs mt-1 ${delta > 0 ? "text-amber-600" : delta < 0 ? "text-emerald-600" : ""}`}>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)} since first result
                  </p>
                ) : null}
              </div>
            );
          })}
      </div>
    </section>
  );
};
