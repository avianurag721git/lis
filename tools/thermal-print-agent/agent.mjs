#!/usr/bin/env node
/**
 * Local thermal print agent — receives raw ZPL/EPL over WebSocket and forwards
 * to a network printer (TCP :9100) or stdout (dry-run).
 *
 * Usage:
 *   node tools/thermal-print-agent/agent.mjs
 *   PRINT_HOST=192.168.1.50 PRINT_PORT=9100 node tools/thermal-print-agent/agent.mjs
 *
 * Browser connects to ws://127.0.0.1:9101 (see frontend/src/lib/printer).
 */
import http from "node:http";
import net from "node:net";
import { WebSocketServer } from "ws";

const AGENT_PORT = Number(process.env.PRINT_AGENT_PORT || 9101);
const PRINT_HOST = process.env.PRINT_HOST || "";
const PRINT_PORT = Number(process.env.PRINT_PORT || 9100);
const DRY_RUN = process.env.PRINT_DRY_RUN === "1" || !PRINT_HOST;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DiagLab thermal print agent OK\n");
});

const wss = new WebSocketServer({ server });

const sendToPrinter = (buf) =>
  new Promise((resolve, reject) => {
    if (DRY_RUN) {
      console.log(`[dry-run] ${buf.length} bytes:\n${buf.toString("utf8").slice(0, 500)}`);
      resolve(buf.length);
      return;
    }
    const socket = net.createConnection({ host: PRINT_HOST, port: PRINT_PORT }, () => {
      socket.write(buf, (err) => {
        if (err) {
          reject(err);
          return;
        }
        socket.end();
        resolve(buf.length);
      });
    });
    socket.setTimeout(8000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Printer TCP timeout"));
    });
    socket.on("error", reject);
  });

wss.on("connection", (ws) => {
  ws.on("message", async (data, isBinary) => {
    try {
      let buf;
      if (isBinary) {
        buf = Buffer.from(data);
      } else {
        const text = data.toString("utf8");
        try {
          const msg = JSON.parse(text);
          if (msg?.type === "print" && typeof msg.payload === "string") {
            buf = Buffer.from(msg.payload, "utf8");
          } else {
            buf = Buffer.from(text, "utf8");
          }
        } catch {
          buf = Buffer.from(text, "utf8");
        }
      }
      const bytesSent = await sendToPrinter(buf);
      ws.send(JSON.stringify({ ok: true, bytesSent }));
    } catch (err) {
      ws.send(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : "print failed"
        })
      );
    }
  });
});

server.listen(AGENT_PORT, "127.0.0.1", () => {
  console.log(
    `Thermal print agent on ws://127.0.0.1:${AGENT_PORT}` +
      (DRY_RUN ? " (dry-run — set PRINT_HOST to forward to :9100)" : ` → ${PRINT_HOST}:${PRINT_PORT}`)
  );
});
