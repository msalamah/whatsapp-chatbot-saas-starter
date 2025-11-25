import { PendingBooking, Appointment, OwnerCredentials, CustomerRecord, ServiceRecord, ServiceFormState } from "./types";

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

export async function fetchAppointments(token: string, options: { limit?: number; range?: string } = {}): Promise<Appointment[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.range) params.set("range", options.range);
  const path = params.size ? `/owner/appointments?${params.toString()}` : "/owner/appointments";
  const data = await request(path, {}, token);
  return data.appointments || [];
}

export async function resolvePending(token: string, customerId: string, action: "approve" | "reject") {
  return request(`/owner/pending/${customerId}/${action}`, { method: "POST" }, token);
}

export async function fetchCustomers(token: string, options: { limit?: number; query?: string } = {}): Promise<CustomerRecord[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.query) params.set("q", options.query);
  const path = params.size ? `/owner/customers?${params.toString()}` : "/owner/customers";
  const data = await request(path, {}, token);
  return data.customers || [];
}

export async function fetchServices(token: string): Promise<ServiceRecord[]> {
  const data = await request("/owner/services", {}, token);
  return data.services || [];
}

export async function upsertService(token: string, service: ServiceFormState) {
  const data = await request("/owner/services", { method: "POST", body: JSON.stringify(service) }, token);
  return data;
}

export async function deleteService(token: string, serviceId: string) {
  const data = await request(`/owner/services/${serviceId}`, { method: "DELETE" }, token);
  return data;
}

export async function fetchCustomerDetail(token: string, customerId: string) {
  const data = await request(`/owner/customers/${customerId}`, {}, token);
  return data;
}

export function downloadCsv(path: string, token: string) {
  const url = `${API_BASE}${path}`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.setAttribute("download", "");
  anchor.click();
}
