import { PendingBooking, Appointment, OwnerCredentials } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

async function request(path: string, options: RequestInit = {}, token?: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function loginOwner(tenantKey: string, ownerToken: string): Promise<OwnerCredentials> {
  return request("/owner/login", { method: "POST", body: JSON.stringify({ tenantKey, token: ownerToken }) });
}

export async function fetchPending(token: string): Promise<PendingBooking[]> {
  const data = await request("/owner/pending", {}, token);
  return data.pending || [];
}

export async function fetchAppointments(token: string): Promise<Appointment[]> {
  const data = await request("/owner/appointments", {}, token);
  return data.appointments || [];
}

export async function resolvePending(token: string, customerId: string, action: "approve" | "reject") {
  return request(`/owner/pending/${customerId}/${action}`, { method: "POST" }, token);
}
