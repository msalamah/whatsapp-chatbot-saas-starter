import {
  PendingBooking,
  Appointment,
  OwnerCredentials,
  CustomerRecord,
  ServiceRecord,
  ServiceFormState,
  AnalyticsSummary,
  OwnerCalendar
} from "./types";

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
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText);
      return res.blob();
    })
    .then((blob) => {
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = path.includes("customers") ? "customers.csv" : "appointments.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    })
    .catch((err) => {
      // eslint-disable-next-line no-alert
      alert(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    });
}

export async function fetchAnalytics(token: string): Promise<AnalyticsSummary> {
  const data = await request("/owner/analytics", {}, token);
  return data.analytics;
}

export async function fetchCalendarSettings(token: string): Promise<OwnerCalendar> {
  const data = await request("/owner/calendar", {}, token);
  return data.calendar;
}

export async function saveCalendarSettings(token: string, calendar: OwnerCalendar): Promise<OwnerCalendar> {
  const data = await request("/owner/calendar", { method: "PUT", body: JSON.stringify(calendar) }, token);
  return data.calendar;
}
