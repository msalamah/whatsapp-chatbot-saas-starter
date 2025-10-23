import { AdminCredentials, AuditEvent, Tenant, TenantPayload } from "./types";

function buildHeaders(creds: AdminCredentials, isJson = true) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    "X-Admin-Actor": creds.actor || "admin",
    "X-Admin-Role": creds.role || "admin"
  };
  if (isJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchTenants(creds: AdminCredentials, includeSensitive = false): Promise<Tenant[]> {
  const url = new URL("/tenants", creds.baseUrl);
  if (includeSensitive) url.searchParams.set("includeSensitive", "true");
  const res = await fetch(url.toString(), {
    headers: buildHeaders(creds, false)
  });
  const data = await handleResponse(res);
  return data.tenants;
}

export async function createTenant(creds: AdminCredentials, payload: TenantPayload) {
  const res = await fetch(new URL("/tenants", creds.baseUrl).toString(), {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify(payload)
  });
  return handleResponse(res);
}

export async function patchTenant(creds: AdminCredentials, key: string, payload: Partial<TenantPayload>) {
  const res = await fetch(new URL(`/tenants/${key}`, creds.baseUrl).toString(), {
    method: "PATCH",
    headers: buildHeaders(creds),
    body: JSON.stringify(payload)
  });
  return handleResponse(res);
}

export async function rotateToken(creds: AdminCredentials, key: string, token: string) {
  const res = await fetch(new URL(`/tenants/${key}/rotate-token`, creds.baseUrl).toString(), {
    method: "POST",
    headers: buildHeaders(creds),
    body: JSON.stringify({ token })
  });
  return handleResponse(res);
}

export async function removeTenant(creds: AdminCredentials, key: string) {
  const res = await fetch(new URL(`/tenants/${key}`, creds.baseUrl).toString(), {
    method: "DELETE",
    headers: buildHeaders(creds, false)
  });
  await handleResponse(res);
}

export async function fetchActivity(creds: AdminCredentials, limit = 50): Promise<AuditEvent[]> {
  const url = new URL("/tenants/activity", creds.baseUrl);
  if (limit) url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: buildHeaders(creds, false)
  });
  const data = await handleResponse(res);
  return data.events;
}
