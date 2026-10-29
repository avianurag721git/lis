import net from "net";
import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import { buildHl7Ack, MllpBuffer, wrapMllp } from "./mllp";
import { analyzerIngestService } from "./analyzerIngest.service";
import { isHl7Message } from "./hl7Parser";

let server: net.Server | null = null;

const resolveListenPort = (): number => {
  const requested = env.analyzerTcpPort;
  if (requested === env.port) {
    const fallback = requested === 5000 ? 5055 : requested + 1;
    logger.warn(
      { httpPort: env.port, requestedAnalyzerPort: requested, fallback },
      "Analyzer TCP port conflicts with HTTP PORT — using fallback. Set PORT and ANALYZER_TCP_PORT to distinct values (lab machines typically need ANALYZER_TCP_PORT=5000)."
    );
    return fallback;
  }
  return requested;
};

/**
 * TCP/IP socket server for Sysmex / Roche / Mindray analyzers.
 * Accepts MLLP-framed HL7 and bare ASTM E1394 streams.
 */
export const startAnalyzerSocketServer = (): net.Server | null => {
  if (!env.analyzerGatewayEnabled) {
    logger.info("Analyzer gateway disabled (ANALYZER_GATEWAY_ENABLED=false)");
    return null;
  }
  if (server) return server;

  const listenPort = resolveListenPort();
  const tenantId = env.analyzerDefaultTenantId;

  server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;
    logger.info({ remote }, "Analyzer TCP connected");
    const mllp = new MllpBuffer();
    let idleTimer: NodeJS.Timeout | null = null;

    const clearIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };

    const scheduleIdleFlush = (): void => {
      clearIdle();
      idleTimer = setTimeout(() => {
        const leftovers = mllp.flush();
        for (const msg of leftovers) {
          void handleMessage(msg);
        }
      }, 500);
    };

    const handleMessage = async (raw: string): Promise<void> => {
      try {
        const result = await analyzerIngestService.ingestRaw(tenantId, raw, {
          remoteAddress: remote
        });
        // HL7 → MLLP ACK
        if (isHl7Message(raw)) {
          const mshLine = raw.replace(/\n/g, "\r").split("\r").find((l) => l.startsWith("MSH")) ?? "MSH|^~\\&";
          const ack = buildHl7Ack(mshLine, "AA");
          socket.write(wrapMllp(ack));
          logger.debug({ barcode: result.barcode }, "Sent HL7 ACK");
        } else {
          // ASTM often expects <ACK> (0x06)
          socket.write(Buffer.from([0x06]));
        }
      } catch (err) {
        logger.error({ err, remote }, "Analyzer ingest failed");
        try {
          if (isHl7Message(raw)) {
            const mshLine = raw.replace(/\n/g, "\r").split("\r").find((l) => l.startsWith("MSH")) ?? "MSH|^~\\&";
            socket.write(wrapMllp(buildHl7Ack(mshLine, "AE")));
          } else {
            socket.write(Buffer.from([0x15])); // NAK
          }
        } catch {
          /* ignore write errors */
        }
      }
    };

    socket.on("data", (chunk) => {
      clearIdle();
      const framed = mllp.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      for (const msg of framed) {
        void handleMessage(msg);
      }
      if (!framed.length) {
        scheduleIdleFlush();
      }
    });

    socket.on("error", (err) => {
      logger.warn({ err, remote }, "Analyzer socket error");
    });

    socket.on("close", () => {
      clearIdle();
      logger.info({ remote }, "Analyzer TCP disconnected");
    });
  });

  server.on("error", (err) => {
    logger.error({ err, port: listenPort }, "Analyzer TCP server failed");
  });

  server.listen(listenPort, () => {
    logger.info(
      { port: listenPort, tenantId, expectedByLabs: 5000 },
      "Analyzer interface gateway listening (MLLP HL7 + ASTM)"
    );
  });

  return server;
};

export const stopAnalyzerSocketServer = (): Promise<void> =>
  new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      logger.info("Analyzer TCP server stopped");
      resolve();
    });
  });
