import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../cache/redis.client";
import { env } from "../../config/env";

type RedisCmdReply = boolean | number | string | (boolean | number | string)[];

const buildSendCommand = ():
  | ((...args: string[]) => Promise<RedisCmdReply>)
  | undefined => {
  const redis = getRedis();
  if (!redis) {
    return undefined;
  }
  return (...args: string[]): Promise<RedisCmdReply> => {
    const command = args[0];
    if (command === undefined) {
      return Promise.reject(new Error("Redis command missing"));
    }
    return redis.call(command, ...args.slice(1)) as Promise<RedisCmdReply>;
  };
};

const apiBase = {
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: import("express").Request): boolean => {
    if (req.path === "/" || req.path.startsWith("/health")) {
      return true;
    }
    if (req.method === "POST" && req.path === "/payments/webhook") {
      return true;
    }
    return false;
  }
};

const apiSend = buildSendCommand();
export const apiRateLimiter = rateLimit({
  ...apiBase,
  ...(apiSend != null ? { store: new RedisStore({ sendCommand: apiSend }) } : {})
} as unknown as Options);

const authBase = {
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { message: "Too many authentication attempts", code: "AUTH_RATE_LIMIT" }
};

const authSend = buildSendCommand();
export const authCredentialRateLimiter = rateLimit({
  ...authBase,
  ...(authSend != null ? { store: new RedisStore({ sendCommand: authSend, prefix: "rl:auth:" }) } : {})
} as unknown as Options);

/** Refresh / logout abuse protection */
export const authSessionRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: Math.min(env.authRateLimitMax * 2, 60),
  standardHeaders: true,
  legacyHeaders: false,
  ...(authSend != null ? { store: new RedisStore({ sendCommand: authSend, prefix: "rl:auth-session:" }) } : {})
} as unknown as Options);

/** Report PDF download / presign — stricter */
export const reportDownloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many report download requests", code: "REPORT_RATE_LIMIT" },
  ...(apiSend != null ? { store: new RedisStore({ sendCommand: apiSend, prefix: "rl:report:" }) } : {})
} as unknown as Options);
