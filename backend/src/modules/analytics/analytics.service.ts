import { buildDashboardCacheKey, cacheGetJson, cacheSetJson } from "../../common/cache/dashboard-cache";
import { isRedisConfigured } from "../../common/cache/redis.client";
import { analyticsRepository } from "./analytics.repository";
import { AnalyticsDashboard } from "./analytics.types";

const DEFAULT_RANGE_DAYS = 30;
const RECENT_LIMIT = 25;

export type DashboardQuery = {
  from?: string;
  to?: string;
};

function resolveRange(query: DashboardQuery): { fromIso: string; toIso: string; fromKey: string; toKey: string } {
  const toDate = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();
  const fromDate = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    const now = new Date();
    const fallbackFrom = new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    return {
      fromIso: fallbackFrom.toISOString(),
      toIso: now.toISOString(),
      fromKey: fallbackFrom.toISOString().slice(0, 10),
      toKey: now.toISOString().slice(0, 10)
    };
  }

  return {
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
    fromKey: fromDate.toISOString().slice(0, 10),
    toKey: toDate.toISOString().slice(0, 10)
  };
}

export const analyticsService = {
  async getDashboard(tenantId: string, query: DashboardQuery): Promise<AnalyticsDashboard> {
    const range = resolveRange(query);
    const cacheKey = buildDashboardCacheKey(tenantId, range.fromKey, range.toKey);

    if (isRedisConfigured()) {
      const cached = await cacheGetJson<AnalyticsDashboard>(cacheKey);
      if (cached) {
        return { ...cached, cachedAt: cached.cachedAt ?? new Date().toISOString() };
      }
    }

    const rangeArg = { fromIso: range.fromIso, toIso: range.toIso };

    const [totalRevenueMinor, paymentsByDate, patientCount, refundTotalMinor, recentActivity] = await Promise.all([
      analyticsRepository.totalRevenueMinor(tenantId, rangeArg),
      analyticsRepository.paymentsByDate(tenantId, rangeArg),
      analyticsRepository.distinctPatientCount(tenantId),
      analyticsRepository.refundTotalMinor(tenantId, rangeArg),
      analyticsRepository.recentActivity(tenantId, RECENT_LIMIT)
    ]);

    const payload: AnalyticsDashboard = {
      totalRevenueMinor,
      refundTotalMinor,
      patientCount,
      paymentsByDate,
      recentActivity,
      range: {
        from: range.fromIso,
        to: range.toIso
      },
      cachedAt: new Date().toISOString()
    };

    if (isRedisConfigured()) {
      await cacheSetJson(cacheKey, payload);
    }

    return payload;
  }
};
