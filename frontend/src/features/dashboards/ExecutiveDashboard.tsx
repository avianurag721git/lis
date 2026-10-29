import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ClipboardList, IndianRupee, Timer, Users } from "lucide-react";
import { money } from "./dashboard.service";
import { DashboardModuleBookmarks } from "./DashboardModuleBookmarks";
import { useDashboardRealtime, useLisQueries } from "./useDashboardRealtime";

const PIE_COLORS = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#b91c1c"];

export const ExecutiveDashboard = (): JSX.Element => {
  const { executive, tat, rejections } = useLisQueries();
  useDashboardRealtime(["dash-executive", "dash-tat", "dash-rejections"]);

  const exe = executive.data;
  const tatData = tat.data;
  const rej = rejections.data;
  const loading = executive.isLoading && !exe;

  const collectionChart =
    exe?.byCollectionType.map((r) => ({
      name: r.collectionType.replace(/_/g, " "),
      revenue: Number((r.revenueMinor / 100).toFixed(2)),
      orders: r.orderCount
    })) ?? [];

  const branchChart =
    exe?.byBranch.map((r) => ({
      name: r.branch.length > 16 ? `${r.branch.slice(0, 14)}…` : r.branch,
      revenue: Number((r.revenueMinor / 100).toFixed(2)),
      orders: r.orderCount
    })) ?? [];

  const salesOrdersChart =
    collectionChart.length > 0
      ? collectionChart
      : [
          {
            name: "Paid (30d)",
            revenue: Number(((exe?.revenue.monthlyMinor ?? 0) / 100).toFixed(2)),
            orders: exe?.revenue.orderCount ?? 0
          }
        ];

  const deptWorkload =
    tatData?.byDepartment.map((d) => ({
      name: d.departmentName.length > 14 ? `${d.departmentName.slice(0, 12)}…` : d.departmentName,
      hours: d.avgTatHours,
      count: d.count
    })) ?? [];

  const rejectionChart =
    rej?.byReason
      .filter((r) => r.count > 0)
      .map((r) => ({
        reason: r.reason.replace(/_/g, " "),
        count: r.count,
        percent: r.percent
      })) ?? [];

  return (
    <section className="page-shell dash-shell">
      <div className="page-head">
        <h1 className="page-title">Executive dashboard</h1>
        <p className="page-subtitle">
          Sales, orders, and operations at a glance — plus bookmarks for your most-used modules.
        </p>
      </div>

      <DashboardModuleBookmarks />

      <div className="kpi-grid">
        <article className="kpi-card">
          <div className="kpi-icon kpi-icon--teal">
            <IndianRupee size={22} />
          </div>
          <div>
            <div className="kpi-label">Monthly revenue</div>
            <div className="kpi-value">{money(exe?.revenue.monthlyMinor ?? 0)}</div>
            <div className="kpi-sub">
              Today {money(exe?.revenue.dailyMinor ?? 0)} · Week {money(exe?.revenue.weeklyMinor ?? 0)}
            </div>
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-icon kpi-icon--blue">
            <Users size={22} />
          </div>
          <div>
            <div className="kpi-label">Total patients</div>
            <div className="kpi-value">{exe?.patientCount ?? "—"}</div>
            <div className="kpi-sub">Avg order value {money(exe?.revenue.aovMinor ?? 0)}</div>
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-icon kpi-icon--amber">
            <ClipboardList size={22} />
          </div>
          <div>
            <div className="kpi-label">Paid orders (30d)</div>
            <div className="kpi-value">{loading ? "…" : (exe?.revenue.orderCount ?? "—")}</div>
            <div className="kpi-sub">Active samples {exe?.activeSamples ?? "—"}</div>
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-icon kpi-icon--violet">
            <Timer size={22} />
          </div>
          <div>
            <div className="kpi-label">TAT compliance</div>
            <div className="kpi-value">{tatData?.withinSlaPercent ?? "—"}%</div>
            <div className="kpi-sub">
              SLA {tatData?.slaHours ?? 24}h · avg {tatData?.avgTatHours ?? "—"}h · breached{" "}
              {tatData?.breachedCount ?? 0}
            </div>
          </div>
        </article>
      </div>

      <div className="dash-charts">
        <div className="card chart-card">
          <h2 className="card-title">Sales &amp; order volume</h2>
          <p className="chart-subtitle">Revenue (₹) and order count by collection channel — last 30 days.</p>
          <div className="chart-box">
            {salesOrdersChart.every((r) => r.orders === 0 && r.revenue === 0) ? (
              <p className="text-muted chart-empty">No paid orders in range yet — book and bill an order to populate this chart.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={salesOrdersChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" fill="#0f766e" name="₹ Revenue" radius={[6, 6, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orders"
                    stroke="#d97706"
                    strokeWidth={2}
                    name="Orders"
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card chart-card">
          <h2 className="card-title">Branch comparison</h2>
          <div className="chart-box">
            {branchChart.length === 0 ? (
              <p className="text-muted chart-empty">No branch revenue yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={branchChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#2563eb" name="₹ Revenue" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="dash-charts">
        <div className="card chart-card">
          <h2 className="card-title">Revenue by collection type</h2>
          <div className="chart-box">
            {collectionChart.length === 0 ? (
              <p className="text-muted chart-empty">No collection-type revenue yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={collectionChart}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#0f766e" fill="url(#revFill)" name="₹ Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card chart-card">
          <h2 className="card-title">Orders by collection type</h2>
          <div className="chart-box">
            {collectionChart.length === 0 ? (
              <p className="text-muted chart-empty">No orders by channel yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={collectionChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#d97706" name="Orders" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="dash-charts">
        <div className="card chart-card">
          <h2 className="card-title">Department workload (avg TAT hours)</h2>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptWorkload}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="hours" fill="#7c3aed" name="Avg hours" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card chart-card">
          <h2 className="card-title">Sample rejection breakdown</h2>
          <p className="chart-subtitle">
            Samples rejected at phlebotomy or lab receiving — quality gate before processing.
          </p>
          <div className="rejection-summary">
            <div>
              <span className="rejection-summary-label">Rejected</span>
              <span className="rejection-summary-value">{rej?.rejectedCount ?? 0}</span>
            </div>
            <div>
              <span className="rejection-summary-label">Total samples</span>
              <span className="rejection-summary-value">{rej?.totalSamples ?? 0}</span>
            </div>
            <div>
              <span className="rejection-summary-label">Rejection rate</span>
              <span className="rejection-summary-value">{rej?.rejectionRatePercent ?? 0}%</span>
            </div>
          </div>
          <div className="chart-box">
            {rejectionChart.length === 0 ? (
              <p className="text-muted chart-empty">No rejected samples in the selected period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={rejectionChart}
                    dataKey="count"
                    nameKey="reason"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry: any) => `${entry.reason} (${Math.round((entry.percent ?? 0) * 100)}%)`}
                  >
                    {rejectionChart.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length] ?? "#000"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [`${value ?? 0} samples`, name ?? ""]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="dash-charts">
        <div className="card table-scroll">
          <h2 className="card-title">Top 10 tests</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Orders</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(exe?.topTests ?? []).map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{t.orderCount}</td>
                  <td>{money(t.revenueMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card table-scroll">
          <h2 className="card-title">Top packages</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Orders</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(exe?.topPackages ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted">
                    No package orders in range.
                  </td>
                </tr>
              ) : (
                (exe?.topPackages ?? []).map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td>{t.orderCount}</td>
                    <td>{money(t.revenueMinor)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
