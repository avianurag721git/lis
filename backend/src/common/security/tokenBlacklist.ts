import { createHash } from "crypto";
import { getRedis, isRedisConfigured } from "../cache/redis.client";
import { logger } from "../logger/logger";

/**
 * Redis-backed JWT denylist. Falls back to in-process Map when Redis is unavailable
 * (still blocks tokens on the same API instance after logout).
 */
const memory = new Map<string, number>(); // jti -> expiresAtMs

const pruneMemory = (): void => {
  const now = Date.now();
  for (const [k, exp] of memory) {
    if (exp <= now) memory.delete(k);
  }
};

export const tokenBlacklist = {
  async revoke(jti: string, expiresAtUnixSec: number): Promise<void> {
    const ttl = Math.max(1, expiresAtUnixSec - Math.floor(Date.now() / 1000));
    if (isRedisConfigured()) {
      const redis = getRedis();
      if (redis) {
        try {
          if (redis.status !== "ready") await redis.connect().catch(() => undefined);
          await redis.set(`jwt:bl:${jti}`, "1", "EX", ttl);
          return;
        } catch (err) {
          logger.warn({ err }, "Redis blacklist write failed — using memory fallback");
        }
      }
    }
    memory.set(jti, Date.now() + ttl * 1000);
  },

  async isRevoked(jti: string): Promise<boolean> {
    if (isRedisConfigured()) {
      const redis = getRedis();
      if (redis) {
        try {
          if (redis.status !== "ready") await redis.connect().catch(() => undefined);
          const v = await redis.get(`jwt:bl:${jti}`);
          if (v) return true;
        } catch (err) {
          logger.warn({ err }, "Redis blacklist read failed — checking memory");
        }
      }
    }
    pruneMemory();
    const exp = memory.get(jti);
    return Boolean(exp && exp > Date.now());
  },

  /** Hash opaque refresh token for denylist when jti is unavailable. */
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
};
