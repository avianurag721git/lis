import Redis from "ioredis";
import { env } from "../../config/env";

let client: Redis | null = null;

export const getRedis = (): Redis | null => {
  if (!env.redisUrl) {
    return null;
  }
  if (!client) {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableReadyCheck: true
    });
    client.on("error", (err) => {
      console.error("Redis connection error", err.message);
    });
  }
  return client;
};

export const isRedisConfigured = (): boolean => Boolean(env.redisUrl);
