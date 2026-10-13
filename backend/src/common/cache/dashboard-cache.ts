import { getRedis } from "./redis.client";
import { env } from "../../config/env";

const dashboardKeyPrefix = (tenantId: string): string => `analytics:dashboard:${tenantId}:`;

export const buildDashboardCacheKey = (tenantId: string, fromKey: string, toKey: string): string =>
  `${dashboardKeyPrefix(tenantId)}${fromKey}:${toKey}`;

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }
  try {
    if (redis.status !== "ready") {
      await redis.connect().catch(() => undefined);
    }
    const raw = await redis.get(key);
    if (raw == null) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSec: number = env.analyticsCacheTtlSec): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  try {
    if (redis.status !== "ready") {
      await redis.connect().catch(() => undefined);
    }
    await redis.set(key, JSON.stringify(value), "EX", ttlSec);
  } catch (err) {
    console.error("Redis SET failed", err);
  }
}

export async function invalidateDashboardCache(tenantId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  const pattern = `${dashboardKeyPrefix(tenantId)}*`;
  try {
    if (redis.status !== "ready") {
      await redis.connect().catch(() => undefined);
    }
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 128);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("Dashboard cache invalidation failed", err);
  }
}

export function scheduleDashboardInvalidation(tenantId: string): void {
  setImmediate(() => {
    void invalidateDashboardCache(tenantId);
  });
}
