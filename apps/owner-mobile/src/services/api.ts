import Constants from "expo-constants";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "http://localhost:3000";

let refreshHandler: (() => Promise<string | null>) | null = null;

export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestWithRetry<T>(path: string, options: RequestInit, token?: string, allowRefresh = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && token && allowRefresh && refreshHandler) {
      const nextToken = await refreshHandler();
      if (nextToken) {
        return requestWithRetry<T>(path, options, nextToken, false);
      }
    }
    const message = typeof data === "string" ? data : data?.error?.message || data?.error || response.statusText;
    throw new Error(message);
  }

  return data as T;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  return requestWithRetry<T>(path, options, token, true);
}

export async function requestOwnerOtp(phone: string, tenantKey?: string) {
  const response = await fetch(`${API_BASE}/owner/auth/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      ...(tenantKey ? { tenantKey } : {})
    })
  });
  const data = await parseResponse(response);
  return { response, data };
}

export async function verifyOwnerOtp(phone: string, tenantKey: string, code: string) {
  const response = await fetch(`${API_BASE}/owner/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, tenantKey, code })
  });
  const data = await parseResponse(response);
  return { response, data };
}

export async function registerOwner(payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/owner/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await parseResponse(response);
  return { response, data };
}

export async function refreshOwnerSession(refreshToken: string) {
  const response = await fetch(`${API_BASE}/owner/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  const data = await parseResponse(response);
  return { response, data };
}
