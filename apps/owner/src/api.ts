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
  return requestWithRetry(path, options, token, true);
}

let refreshHandler: (() => Promise<string | null>) | null = null;
export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

async function requestWithRetry(path: string, options: RequestInit, token?: string, allowRefresh = true) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && token && allowRefresh && refreshHandler) {
      const next = await refreshHandler();
      if (next) {
        return requestWithRetry(path, options, next, false);
      }
    }
    const message = typeof data === "string" ? data : data?.error?.message || data?.error || res.statusText;
    throw new Error(message);
  }
  return data;
}

function mapAuthError(code: string | undefined, fallback: string) {
  switch (code) {
    case "RATE_LIMITED":
      return "Too many requests. Please wait and try again.";
    case "PHONE_INVALID":
      return "Enter a valid phone number with country code.";
    case "TENANT_SELECTION_REQUIRED":
      return "Choose your business to continue.";
    case "OWNER_NOT_FOUND":
      return "We couldn't find that phone number. Please register first.";
    case "OWNER_NOT_LINKED":
      return "This phone is not linked to the selected tenant.";
    case "OTP_SEND_FAILED":
      return "We couldn't send the code. Try again shortly.";
    case "OTP_NOT_FOUND":
    case "OTP_EXPIRED":
      return "That code expired. Request a new one.";
    case "OTP_LOCKED":
      return "Too many attempts. Please wait before trying again.";
    case "OTP_USED":
      return "That code was already used. Request a new one.";
    case "OTP_CODE_REQUIRED":
      return "Enter the verification code.";
    case "TENANT_KEY_REQUIRED":
      return "Tenant key is required.";
    case "PHONE_ALREADY_REGISTERED":
      return "This phone is already registered. Try logging in.";
    case "REGISTER_REQUIRED_FIELDS":
      return "Business name, owner name, and phone are required.";
    case "REGISTER_FAILED":
      return "Registration failed. Please try again.";
    default:
      return fallback;
  }
}

export async function requestOwnerOtp(phone: string, tenantKey?: string) {
  const res = await fetch(`${API_BASE}/owner/auth/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      ...(tenantKey ? { tenantKey } : {})
    })
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (res.status === 409) {
    return { tenants: data?.tenants || [] };
  }
  if (!res.ok) {
    const message = typeof data === "string"
      ? data
      : mapAuthError(data?.error?.code, data?.error?.message || res.statusText);
    throw new Error(message);
  }
  return data;
}

export async function verifyOwnerOtp(phone: string, tenantKey: string, code: string): Promise<OwnerCredentials> {
  const res = await fetch(`${API_BASE}/owner/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, tenantKey, code })
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = typeof data === "string"
      ? data
      : mapAuthError(data?.error?.code, data?.error?.message || res.statusText);
    throw new Error(message);
  }
  return data as OwnerCredentials;
}

export async function registerOwner(payload: {
  displayName: string;
  ownerName: string;
  phone: string;
  email?: string;
  timezone?: string;
  services?: Array<{
    name: string;
    minMinutes: number;
    maxMinutes: number;
    price?: number;
    currency?: string;
  }>;
}) {
  const res = await fetch(`${API_BASE}/owner/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = typeof data === "string"
      ? data
      : mapAuthError(data?.error?.code, data?.error?.message || res.statusText);
    throw new Error(message);
  }
  return data;
}

export async function refreshOwnerSession(refreshToken: string): Promise<OwnerCredentials> {
  const res = await fetch(`${API_BASE}/owner/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = typeof data === "string"
      ? data
      : mapAuthError(data?.error?.code, data?.error?.message || res.statusText);
    throw new Error(message);
  }
  return data as OwnerCredentials;
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
