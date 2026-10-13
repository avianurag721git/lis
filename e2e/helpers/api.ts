const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5000";
const TENANT = "demo";
const PASSWORD = "DemoPass123!";

export type AuthSession = {
  accessToken: string;
  userId: string;
};

export const loginApi = async (email: string): Promise<AuthSession> => {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tenant-id": TENANT },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { accessToken: body.accessToken, userId: body.user.id };
};

const apiFetch = async (path: string, token: string, init?: RequestInit) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": TENANT,
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
};

export const collectSample = async (
  token: string,
  barcode: string
): Promise<{ orderId: string; barcode: string }> => {
  const body = (await apiFetch("/samples/collect", token, {
    method: "POST",
    body: JSON.stringify({ barcode })
  })) as { data?: { sample?: { orderId: string; barcode: string } } };
  const sample = body.data?.sample;
  if (!sample?.orderId) throw new Error("Collect did not return sample orderId");
  return { orderId: sample.orderId, barcode: sample.barcode };
};

export const getVerifyReport = async (orderId: string, verifyToken?: string) => {
  const q = verifyToken ? `?t=${verifyToken}` : "";
  const res = await fetch(`${API}/api/reports/verify-public/${orderId}${q}`);
  return res.json() as Promise<{
    success: boolean;
    data: { valid: boolean; orderId: string; orderNumber?: string };
  }>;
};

export const getOrderReportMeta = async (token: string, orderId: string) => {
  const body = await apiFetch(`/api/reports/download/${orderId}`, token, { method: "GET" });
  return body;
};

export { API, TENANT, PASSWORD };
