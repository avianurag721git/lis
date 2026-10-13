import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";

const apiTarget = "http://127.0.0.1:5000";

/** Backend routes mounted at app root — proxy in dev when VITE_API_URL is same-origin. */
const apiProxyPaths = [
  "tenants",
  "auth",
  "health",
  "saas-admin",
  "api",
  "catalog",
  "patients",
  "orders",
  "samples",
  "lab-results",
  "cashier",
  "billing",
  "b2b",
  "inventory",
  "pathologist",
  "ai",
  "referral-doctors",
  "users",
  "analytics",
  "operations",
  "reports",
  "hl7-astm",
  "whatsapp",
  "ocr",
  "kiosk",
  "logistics",
  "invoices",
  "payments",
  "refunds",
  "audit-logs",
  "verify"
];

/**
 * Many API prefixes collide with React Router paths (`/billing`, `/orders`, …).
 * Browser refreshes send Accept: text/html — serve the SPA instead of proxying to Express.
 * XHR/fetch keep Accept: application/json and still hit the API.
 */
const bypassSpaNavigation = (req: IncomingMessage): string | undefined => {
  const accept = req.headers.accept ?? "";
  if (req.method === "GET" && accept.includes("text/html")) {
    return "/index.html";
  }
  return undefined;
};

const proxyEntry = (): ProxyOptions => ({
  target: apiTarget,
  changeOrigin: true,
  bypass: bypassSpaNavigation
});

const devProxy = Object.fromEntries(apiProxyPaths.map((path) => [`/${path}`, proxyEntry()]));

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: "./postcss.config.js"
  },
  optimizeDeps: {
    // jspdf is lazy-loaded; keep it out of prebundle so optional html2canvas
    // does not block Vite dep optimization / SPA boot.
    include: ["react-barcode"],
    exclude: ["jspdf"]
  },
  server: {
    // Use IPv4 literal so Node does not resolve "localhost" (avoids EAI_FAIL on some Windows/DNS setups)
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: devProxy
  }
});
