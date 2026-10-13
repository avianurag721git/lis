import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const startOfDay = (d = new Date()): Date => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const categorizeRejection = (reason: string | null): string => {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("hemolyz") || r.includes("haemolyz")) return "Hemolyzed";
  if (r.includes("clot")) return "Clotted";
  if (r.includes("insufficient") || r.includes("volume") || r.includes("qty")) return "Insufficient Volume";
  if (r.includes("wrong") || r.includes("tube") || r.includes("container")) return "Wrong Tube";
  return "Other";
};

export type ExecutiveSummary = {
  revenue: {
    dailyMinor: number;
    weeklyMinor: number;
    monthlyMinor: number;
    aovMinor: number;
    orderCount: number;
  };
  byCollectionType: Array<{ collectionType: string; revenueMinor: number; orderCount: number }>;
  byBranch: Array<{ branch: string; revenueMinor: number; orderCount: number }>;
  topTests: Array<{ name: string; orderCount: number; revenueMinor: number }>;
  topPackages: Array<{ name: string; orderCount: number; revenueMinor: number }>;
  patientCount: number;
  activeSamples: number;
  generatedAt: string;
};

export type TatMetrics = {
  slaHours: number;
  completedCount: number;
  withinSlaCount: number;
  breachedCount: number;
  withinSlaPercent: number;
  avgTatHours: number | null;
  medianTatHours: number | null;
  byDepartment: Array<{ departmentName: string; avgTatHours: number; count: number }>;
  generatedAt: string;
};

export type SampleRejectionMetrics = {
  totalSamples: number;
  rejectedCount: number;
  rejectionRatePercent: number;
  byReason: Array<{ reason: string; count: number; percent: number }>;
  generatedAt: string;
};

export type LivePipeline = {
  stages: Array<{ stage: string; count: number }>;
  criticalAlerts: Array<{
    labResultId: string;
    orderNumber: string;
    patientName: string;
    parameterName: string;
    value: number | null;
    flaggedAt: string;
  }>;
  phlebotomists: Array<{
    userId: string;
    activeCollections: number;
    lastCollectedAt: string | null;
  }>;
  generatedAt: string;
};

export const lisAnalyticsService = {
  async executiveSummary(tenantId: string): Promise<ExecutiveSummary> {
    ensurePg();
    const dayStart = startOfDay().toISOString();
    const weekStart = daysAgo(7).toISOString();
    const monthStart = daysAgo(30).toISOString();

    const revenueInRange = async (fromIso: string): Promise<{ revenueMinor: number; orderCount: number }> => {
      const r = await db.query(
        `SELECT COALESCE(SUM(net_amount_minor), 0)::bigint AS revenue,
                COUNT(*)::int AS orders
         FROM order_bookings
         WHERE tenant_id = $1
           AND created_at >= $2::timestamptz
           AND payment_status IN ('PAID', 'PARTIALLY_PAID', 'WALLET_SETTLED')`,
        [tenantId, fromIso]
      );
      return {
        revenueMinor: Number(r.rows[0]?.revenue ?? 0),
        orderCount: Number(r.rows[0]?.orders ?? 0)
      };
    };

    const [daily, weekly, monthly] = await Promise.all([
      revenueInRange(dayStart),
      revenueInRange(weekStart),
      revenueInRange(monthStart)
    ]);

    const aovMinor = monthly.orderCount > 0 ? Math.round(monthly.revenueMinor / monthly.orderCount) : 0;

    const byType = await db.query(
      `SELECT collection_type,
              COALESCE(SUM(net_amount_minor), 0)::bigint AS revenue,
              COUNT(*)::int AS orders
       FROM order_bookings
       WHERE tenant_id = $1 AND created_at >= $2::timestamptz
         AND payment_status IN ('PAID', 'PARTIALLY_PAID', 'WALLET_SETTLED', 'UNPAID')
       GROUP BY collection_type
       ORDER BY revenue DESC`,
      [tenantId, monthStart]
    );

    // Branch proxy: Main Branch for walk-in/home; franchisee code/name for B2B
    const byBranch = await db.query(
      `SELECT
         CASE
           WHEN o.collection_type = 'B2B_FRANCHISEE' THEN COALESCE(f.name, o.franchisee_id, 'B2B Center')
           ELSE 'Main Branch'
         END AS branch,
         COALESCE(SUM(o.net_amount_minor), 0)::bigint AS revenue,
         COUNT(*)::int AS orders
       FROM order_bookings o
       LEFT JOIN b2b_franchisees f ON f.id::text = o.franchisee_id AND f.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1 AND o.created_at >= $2::timestamptz
       GROUP BY 1
       ORDER BY revenue DESC
       LIMIT 20`,
      [tenantId, monthStart]
    );

    const topTests = await db.query(
      `SELECT oi.name,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(oi.price_minor), 0)::bigint AS revenue
       FROM order_items oi
       JOIN order_bookings o ON o.id = oi.order_id
       WHERE oi.tenant_id = $1 AND oi.item_type = 'TEST' AND o.created_at >= $2::timestamptz
       GROUP BY oi.name
       ORDER BY order_count DESC
       LIMIT 10`,
      [tenantId, monthStart]
    );

    const topPackages = await db.query(
      `SELECT oi.name,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(oi.price_minor), 0)::bigint AS revenue
       FROM order_items oi
       JOIN order_bookings o ON o.id = oi.order_id
       WHERE oi.tenant_id = $1 AND oi.item_type = 'PACKAGE' AND o.created_at >= $2::timestamptz
       GROUP BY oi.name
       ORDER BY order_count DESC
       LIMIT 10`,
      [tenantId, monthStart]
    );

    const patients = await db.query(`SELECT COUNT(*)::int AS c FROM patients WHERE tenant_id = $1`, [tenantId]);
    const activeSamples = await db.query(
      `SELECT COUNT(*)::int AS c FROM samples
       WHERE tenant_id = $1 AND status IN ('PENDING_COLLECTION', 'COLLECTED', 'IN_TRANSIT', 'RECEIVED_IN_LAB')`,
      [tenantId]
    );

    return {
      revenue: {
        dailyMinor: daily.revenueMinor,
        weeklyMinor: weekly.revenueMinor,
        monthlyMinor: monthly.revenueMinor,
        aovMinor,
        orderCount: monthly.orderCount
      },
      byCollectionType: byType.rows.map((r: any) => ({
        collectionType: r.collection_type,
        revenueMinor: Number(r.revenue),
        orderCount: Number(r.orders)
      })),
      byBranch: byBranch.rows.map((r: any) => ({
        branch: r.branch,
        revenueMinor: Number(r.revenue),
        orderCount: Number(r.orders)
      })),
      topTests: topTests.rows.map((r: any) => ({
        name: r.name,
        orderCount: Number(r.order_count),
        revenueMinor: Number(r.revenue)
      })),
      topPackages: topPackages.rows.map((r: any) => ({
        name: r.name,
        orderCount: Number(r.order_count),
        revenueMinor: Number(r.revenue)
      })),
      patientCount: Number(patients.rows[0]?.c ?? 0),
      activeSamples: Number(activeSamples.rows[0]?.c ?? 0),
      generatedAt: new Date().toISOString()
    };
  },

  async tatMetrics(tenantId: string): Promise<TatMetrics> {
    ensurePg();
    const slaHours = env.tatSlaHours;
    const rows = await db.query(
      `SELECT
         d.name AS department_name,
         EXTRACT(EPOCH FROM (lr.verified_at - s.min_collected)) / 3600.0 AS tat_hours
       FROM lab_results lr
       JOIN departments d ON d.id = lr.department_id
       JOIN LATERAL (
         SELECT MIN(collected_at) AS min_collected
         FROM samples
         WHERE order_id = lr.order_id AND tenant_id = lr.tenant_id AND collected_at IS NOT NULL
       ) s ON s.min_collected IS NOT NULL
       WHERE lr.tenant_id = $1
         AND lr.status = 'PATHOLOGIST_VERIFIED'
         AND lr.verified_at IS NOT NULL
         AND lr.verified_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    const tats = rows.rows
      .map((r: any) => Number(r.tat_hours))
      .filter((h: number) => Number.isFinite(h) && h >= 0);
    const completedCount = tats.length;
    const withinSlaCount = tats.filter((h) => h <= slaHours).length;
    const breachedCount = completedCount - withinSlaCount;
    const avgTatHours =
      completedCount > 0 ? Math.round((tats.reduce((a, b) => a + b, 0) / completedCount) * 100) / 100 : null;
    const sorted = [...tats].sort((a, b) => a - b);
    const medianTatHours =
      sorted.length === 0
        ? null
        : sorted.length % 2 === 1
          ? sorted[Math.floor(sorted.length / 2)]!
          : Math.round(((sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2) * 100) / 100;

    const deptMap = new Map<string, { sum: number; count: number }>();
    for (const r of rows.rows) {
      const h = Number(r.tat_hours);
      if (!Number.isFinite(h) || h < 0) continue;
      const name = r.department_name as string;
      const cur = deptMap.get(name) ?? { sum: 0, count: 0 };
      cur.sum += h;
      cur.count += 1;
      deptMap.set(name, cur);
    }

    return {
      slaHours,
      completedCount,
      withinSlaCount,
      breachedCount,
      withinSlaPercent: completedCount > 0 ? Math.round((withinSlaCount / completedCount) * 1000) / 10 : 100,
      avgTatHours,
      medianTatHours,
      byDepartment: [...deptMap.entries()].map(([departmentName, v]) => ({
        departmentName,
        avgTatHours: Math.round((v.sum / v.count) * 100) / 100,
        count: v.count
      })),
      generatedAt: new Date().toISOString()
    };
  },

  async sampleRejections(tenantId: string): Promise<SampleRejectionMetrics> {
    ensurePg();
    const totals = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected
       FROM samples
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );
    const totalSamples = Number(totals.rows[0]?.total ?? 0);
    const rejectedCount = Number(totals.rows[0]?.rejected ?? 0);

    const reasons = await db.query(
      `SELECT rejection_reason FROM samples
       WHERE tenant_id = $1 AND status = 'REJECTED' AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    const bucket = new Map<string, number>();
    for (const label of ["Hemolyzed", "Clotted", "Insufficient Volume", "Wrong Tube", "Other"]) {
      bucket.set(label, 0);
    }
    for (const r of reasons.rows) {
      const key = categorizeRejection(r.rejection_reason);
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }

    const byReason = [...bucket.entries()].map(([reason, count]) => ({
      reason,
      count,
      percent: rejectedCount > 0 ? Math.round((count / rejectedCount) * 1000) / 10 : 0
    }));

    return {
      totalSamples,
      rejectedCount,
      rejectionRatePercent: totalSamples > 0 ? Math.round((rejectedCount / totalSamples) * 1000) / 10 : 0,
      byReason,
      generatedAt: new Date().toISOString()
    };
  },

  async livePipeline(tenantId: string): Promise<LivePipeline> {
    ensurePg();
    const booked = await db.query(
      `SELECT COUNT(*)::int AS c FROM order_bookings WHERE tenant_id = $1 AND status = 'BOOKED'`,
      [tenantId]
    );
    const sampleStages = await db.query(
      `SELECT status, COUNT(*)::int AS c FROM samples
       WHERE tenant_id = $1 AND status IN ('COLLECTED', 'IN_TRANSIT', 'RECEIVED_IN_LAB')
       GROUP BY status`,
      [tenantId]
    );
    const resultStages = await db.query(
      `SELECT status, COUNT(*)::int AS c FROM lab_results
       WHERE tenant_id = $1 AND status IN ('PROCESSING', 'DRAFT', 'TECHNICIAN_APPROVED', 'PATHOLOGIST_VERIFIED')
       GROUP BY status`,
      [tenantId]
    );
    const reports = await db.query(
      `SELECT COUNT(*)::int AS c FROM order_reports WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
      [tenantId]
    );
    const distributed = await db.query(
      `SELECT COUNT(DISTINCT order_id)::int AS c FROM report_distributions
       WHERE tenant_id = $1 AND status = 'SENT' AND created_at >= NOW() - INTERVAL '7 days'`,
      [tenantId]
    );

    const sampleMap = new Map(sampleStages.rows.map((r: any) => [r.status, Number(r.c)]));
    const resultMap = new Map(resultStages.rows.map((r: any) => [r.status, Number(r.c)]));

    const stages = [
      { stage: "BOOKED", count: Number(booked.rows[0]?.c ?? 0) },
      { stage: "SAMPLE_COLLECTED", count: sampleMap.get("COLLECTED") ?? 0 },
      { stage: "IN_TRANSIT", count: sampleMap.get("IN_TRANSIT") ?? 0 },
      { stage: "RECEIVED_IN_LAB", count: sampleMap.get("RECEIVED_IN_LAB") ?? 0 },
      {
        stage: "PROCESSING",
        count: (resultMap.get("PROCESSING") ?? 0) + (resultMap.get("DRAFT") ?? 0)
      },
      { stage: "TECHNICIAN_APPROVED", count: resultMap.get("TECHNICIAN_APPROVED") ?? 0 },
      { stage: "PATHOLOGIST_VERIFIED", count: resultMap.get("PATHOLOGIST_VERIFIED") ?? 0 },
      {
        stage: "REPORT_SENT",
        count: Math.max(Number(distributed.rows[0]?.c ?? 0), Number(reports.rows[0]?.c ?? 0))
      }
    ];

    const critical = await db.query(
      `SELECT lr.id AS lab_result_id, o.order_number, p.name AS patient_name,
              e.parameter_id, par.name AS parameter_name, e.value_numeric, e.updated_at
       FROM lab_result_entries e
       JOIN lab_results lr ON lr.id = e.lab_result_id
       JOIN order_bookings o ON o.id = lr.order_id
       JOIN patients p ON p.id = lr.patient_id
       JOIN parameters par ON par.id = e.parameter_id
       WHERE e.tenant_id = $1 AND e.is_critical = TRUE
         AND lr.status IN ('DRAFT', 'PROCESSING', 'TECHNICIAN_APPROVED')
       ORDER BY e.updated_at DESC
       LIMIT 15`,
      [tenantId]
    );

    const phleb = await db.query(
      `SELECT collected_by_user_id AS user_id,
              COUNT(*)::int AS active_collections,
              MAX(collected_at) AS last_collected_at
       FROM samples
       WHERE tenant_id = $1
         AND collected_by_user_id IS NOT NULL
         AND collected_at >= NOW() - INTERVAL '1 day'
       GROUP BY collected_by_user_id
       ORDER BY active_collections DESC
       LIMIT 20`,
      [tenantId]
    );

    return {
      stages,
      criticalAlerts: critical.rows.map((r: any) => ({
        labResultId: r.lab_result_id,
        orderNumber: r.order_number,
        patientName: r.patient_name,
        parameterName: r.parameter_name,
        value: r.value_numeric == null ? null : Number(r.value_numeric),
        flaggedAt: new Date(r.updated_at).toISOString()
      })),
      phlebotomists: phleb.rows.map((r: any) => ({
        userId: r.user_id,
        activeCollections: Number(r.active_collections),
        lastCollectedAt: r.last_collected_at ? new Date(r.last_collected_at).toISOString() : null
      })),
      generatedAt: new Date().toISOString()
    };
  }
};
