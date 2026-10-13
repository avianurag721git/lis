import pino from "pino";
import { env } from "../../config/env";

const isDev = env.nodeEnv === "development";

export const logger = pino({
  level: env.logLevel,
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" }
        }
      }
    : {
        formatters: {
          level(label) {
            return { level: label };
          }
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        base: { service: "diaglab-api" }
      })
});

export type Logger = typeof logger;
