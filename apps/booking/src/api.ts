import { Service, Slot, TenantSummary } from "./types";

const API_BASE = import.meta.env.VITE_PUBLIC_API_BASE_URL || window.location.origin;

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function fetchTenant(key: string): Promise<TenantSummary> {
  const data = await request(`/public/tenants/${key}`);
  return data.tenant;
}

export async function fetchServices(key: string): Promise<Service[]> {
  const data = await request(`/public/tenants/${key}/services`);
  return data.services || [];
}

export async function fetchAvailability(key: string, serviceId?: string): Promise<Slot[]> {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await request(`/public/tenants/${key}/availability${qs}`);
  return data.slots || [];
}

export async function submitBooking(key: string, payload: { serviceId: string; startISO: string; endISO?: string; name?: string; email?: string; phone?: string }) {
  const res = await request(`/public/tenants/${key}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res;
}
