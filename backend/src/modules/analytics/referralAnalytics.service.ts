import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

export type ReferralDoctorRow = {
  referredDoctor: string;
  month: string;
  orderCount: number;
  patientCount: number;
  netRevenueMinor: number;
  departments: Array<{ departmentName: string; orderCount: number; revenueMinor: number }>;
};

export const referralAnalyticsService = {
  async byDoctor(
    tenantId: string,
    opts: { from?: string; to?: string; doctor?: string }
  ): Promise<{ rows: ReferralDoctorRow[]; totals: { orderCount: number; netRevenueMinor: number } }> {
    if (!env.databaseUrl) {
      throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
    }

    const params: unknown[] = [tenantId];
    let where = `o.tenant_id = $1 AND o.referred_doctor IS NOT NULL AND TRIM(o.referred_doctor) <> ''`;
    if (opts.from) {
      params.push(opts.from);
      where += ` AND o.created_at >= $${params.length}::timestamptz`;
    }
    if (opts.to) {
      params.push(opts.to);
      where += ` AND o.created_at <= $${params.length}::timestamptz`;
    }
    if (opts.doctor) {
      params.push(opts.doctor);
      where += ` AND LOWER(o.referred_doctor) = LOWER($${params.length})`;
    }

    const monthly = await db.query(
      `SELECT
         o.referred_doctor,
         to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month,
         COUNT(*)::int AS order_count,
         COUNT(DISTINCT o.patient_id)::int AS patient_count,
         COALESCE(SUM(o.net_amount_minor), 0)::bigint AS net_revenue_minor
       FROM order_bookings o
       WHERE ${where}
       GROUP BY o.referred_doctor, date_trunc('month', o.created_at)
       ORDER BY month DESC, net_revenue_minor DESC
       LIMIT 200`,
      params
    );

    const dept = await db.query(
      `SELECT
         o.referred_doctor,
         to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month,
         COALESCE(d.name, 'Unassigned') AS department_name,
         COUNT(DISTINCT o.id)::int AS order_count,
         COALESCE(SUM(oi.price_minor), 0)::bigint AS revenue_minor
       FROM order_bookings o
       JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
       LEFT JOIN tests t ON t.id = oi.test_id
       LEFT JOIN departments d ON d.id = t.department_id
       WHERE ${where}
       GROUP BY o.referred_doctor, date_trunc('month', o.created_at), d.name
       ORDER BY revenue_minor DESC
       LIMIT 500`,
      params
    );

    const deptMap = new Map<string, Array<{ departmentName: string; orderCount: number; revenueMinor: number }>>();
    for (const r of dept.rows) {
      const key = `${r.referred_doctor}::${r.month}`;
      const list = deptMap.get(key) ?? [];
      list.push({
        departmentName: r.department_name,
        orderCount: Number(r.order_count),
        revenueMinor: Number(r.revenue_minor)
      });
      deptMap.set(key, list);
    }

    const rows: ReferralDoctorRow[] = monthly.rows.map((r: any) => ({
      referredDoctor: r.referred_doctor,
      month: r.month,
      orderCount: Number(r.order_count),
      patientCount: Number(r.patient_count),
      netRevenueMinor: Number(r.net_revenue_minor),
      departments: deptMap.get(`${r.referred_doctor}::${r.month}`) ?? []
    }));

    const totals = rows.reduce(
      (acc, r) => {
        acc.orderCount += r.orderCount;
        acc.netRevenueMinor += r.netRevenueMinor;
        return acc;
      },
      { orderCount: 0, netRevenueMinor: 0 }
    );

    return { rows, totals };
  }
};
