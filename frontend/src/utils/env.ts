const fromEnv = import.meta.env.VITE_API_URL as string | undefined;

/**
 * Dev default: same-origin (Vite proxies API to backend on :5000).
 * Set VITE_API_URL explicitly to call the API directly (e.g. http://127.0.0.1:5000).
 */
const defaultDevApiUrl = "";

const resolveApiUrl = (): string => {
  const trimmed = fromEnv?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");
  if (import.meta.env.DEV) return defaultDevApiUrl;
  // Production SPA served by nginx — API & Socket.IO on the same host
  if (typeof window !== "undefined") return window.location.origin;
  return "";
};

export const env = {
  apiUrl: resolveApiUrl()
} as const;
