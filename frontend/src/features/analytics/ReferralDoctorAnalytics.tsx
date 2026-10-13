import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { referralAnalyticsApi } from "./referralAnalytics.service";

const money = (minor: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(minor / 100);

export const ReferralDoctorAnalytics = (): JSX.Element => {
  const [doctor, setDoctor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useMemo(() => {
    const p: { from?: string; to?: string; doctor?: string } = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (doctor.trim()) p.doctor = doctor.trim();
    return p;
  }, [from, to, doctor]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["referral-doctors", params],
    queryFn: () => referralAnalyticsApi.byDoctor(params)
  });

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Referral doctor analytics</h1>
        <p className="page-subtitle">Monthly order volume and department revenue by referring physician.</p>
      </div>

      <div className="card form-grid">
        <label className="form-label">
          Doctor
          <input value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Filter by name" />
        </label>
        <label className="form-label">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="form-label">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {isLoading ? <p>Loading…</p> : null}
      {error ? <p className="text-muted">Unable to load analytics (check analytics plan feature).</p> : null}

      {data ? (
        <>
          <p className="text-muted">
            Totals: {data.totals.orderCount} orders · {money(data.totals.netRevenueMinor)}
          </p>
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Month</th>
                  <th>Orders</th>
                  <th>Patients</th>
                  <th>Revenue</th>
                  <th>Departments</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.referredDoctor}-${r.month}`}>
                    <td>{r.referredDoctor}</td>
                    <td>{r.month}</td>
                    <td>{r.orderCount}</td>
                    <td>{r.patientCount}</td>
                    <td>{money(r.netRevenueMinor)}</td>
                    <td>
                      {r.departments
                        .slice(0, 4)
                        .map((d) => `${d.departmentName}: ${money(d.revenueMinor)}`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 ? (
              <p className="text-muted">No referral data yet — set referral doctor on cashier / booking.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
};
