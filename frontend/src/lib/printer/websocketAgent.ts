import { PrinterError, PrintResult } from "./types";

const DEFAULT_AGENT_URL = "ws://127.0.0.1:9101";

/**
 * Local WebSocket print agent — fallback when WebHID/WebUSB cannot claim the device
 * (Windows driver lock, network printers, shared USB). Agent must run on the workstation.
 *
 * Protocol: JSON `{ "type":"print", "dialect":"ZPL"|"EPL", "payload":"<raw>" }`
 * or binary ArrayBuffer of raw printer bytes.
 */
export const websocketAgentPrinter = {
  defaultUrl: DEFAULT_AGENT_URL,

  async ping(url: string = DEFAULT_AGENT_URL, timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const ws = new WebSocket(url);
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        }
      }, timeoutMs);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        ws.close();
        resolve(true);
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(false);
      };
    });
  },

  async sendRaw(
    payload: string | Uint8Array,
    options?: { url?: string; dialect?: "ZPL" | "EPL"; timeoutMs?: number }
  ): Promise<PrintResult> {
    const url = options?.url ?? DEFAULT_AGENT_URL;
    const timeoutMs = options?.timeoutMs ?? 8000;
    const dialect = options?.dialect ?? "ZPL";

    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      const fail = (code: PrinterError["code"], message: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new PrinterError(code, message));
      };

      const timer = window.setTimeout(() => {
        fail("AGENT_UNAVAILABLE", `Print agent timed out at ${url}`);
      }, timeoutMs);

      ws.onerror = () => {
        fail("AGENT_UNAVAILABLE", `Print agent not reachable at ${url}`);
      };

      ws.onopen = () => {
        try {
          if (typeof payload === "string") {
            ws.send(
              JSON.stringify({
                type: "print",
                dialect,
                payload
              })
            );
          } else {
            ws.send(payload);
          }
        } catch (err) {
          fail(
            "WRITE_FAILED",
            err instanceof Error ? err.message : "Failed to send to print agent"
          );
        }
      };

      ws.onmessage = (ev) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try {
          const data =
            typeof ev.data === "string"
              ? (JSON.parse(ev.data) as { ok?: boolean; error?: string; bytesSent?: number })
              : { ok: true };
          if (data.ok === false) {
            reject(new PrinterError("WRITE_FAILED", data.error ?? "Agent print failed"));
          } else {
            const bytes =
              data.bytesSent ??
              (typeof payload === "string" ? new TextEncoder().encode(payload).length : payload.length);
            resolve({ ok: true, transport: "websocket", bytesSent: bytes });
          }
        } catch {
          resolve({
            ok: true,
            transport: "websocket",
            bytesSent:
              typeof payload === "string" ? new TextEncoder().encode(payload).length : payload.length
          });
        } finally {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      };
    });
  }
};
