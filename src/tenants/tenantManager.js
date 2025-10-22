import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const TENANTS_FILE = path.resolve("src/tenants/tenants.json");
let cache = null;

const DEFAULT_WORKING_HOURS = [
  { day: 1, start: "09:00", end: "17:00" },
  { day: 2, start: "09:00", end: "17:00" },
  { day: 3, start: "09:00", end: "17:00" },
  { day: 4, start: "09:00", end: "17:00" },
  { day: 5, start: "09:00", end: "17:00" },
  { day: 6, start: "10:00", end: "14:00" }
];

const DEFAULT_SERVICES = [
  { id: "haircut", name: "Haircut", minMinutes: 30, maxMinutes: 45, price: 45, currency: "USD", description: "Wash, cut, and style", keywords: ["haircut", "cut", "trim"] },
  { id: "color", name: "Hair Color", minMinutes: 60, maxMinutes: 90, price: 120, currency: "USD", description: "Full color application", keywords: ["color", "dye", "highlights"] },
  { id: "mani", name: "Manicure", minMinutes: 40, maxMinutes: 60, price: 35, currency: "USD", description: "Manicure with polish", keywords: ["mani", "manicure", "nails"] }
];

function buildDefaultTenant() {
  return {
    displayName: "Demo Salon",
    wabaToken: process.env.WABA_TOKEN || "",
    phoneNumberId: process.env.PHONE_NUMBER_ID || "",
    graphVersion: process.env.GRAPH_VERSION || "v20.0",
    services: DEFAULT_SERVICES,
    calendar: {
      enabled: false,
      oauthClient: "src/config/google_client_secret.json",
      tokenFile: "src/config/google_token_default.json",
      calendarId: "primary",
      timezone: "America/New_York",
      slotDurationMinutes: 45,
      workingHours: DEFAULT_WORKING_HOURS
    }
  };
}

function ensureCalendarDefaults(calendar = {}) {
  return {
    enabled: !!calendar.enabled,
    oauthClient: calendar.oauthClient || "src/config/google_client_secret.json",
    tokenFile: calendar.tokenFile || "src/config/google_token_default.json",
    calendarId: calendar.calendarId || "primary",
    timezone: calendar.timezone || "America/New_York",
    slotDurationMinutes: calendar.slotDurationMinutes ? Number(calendar.slotDurationMinutes) : 45,
    workingHours: Array.isArray(calendar.workingHours) && calendar.workingHours.length ? calendar.workingHours : DEFAULT_WORKING_HOURS
  };
}

function hydrateTenants(rawTenants = {}) {
  const hydrated = {};
  const entries = Object.entries(rawTenants);
  for (const [key, value] of entries) {
    hydrated[key] = {
      ...value,
      services: normalizeServices(value.services),
      calendar: ensureCalendarDefaults(value.calendar)
    };
  }
  if (!hydrated.default) {
    hydrated.default = {
      ...buildDefaultTenant(),
      services: normalizeServices(DEFAULT_SERVICES)
    };
  }
  return hydrated;
}

export function loadTenants() {
  if (!cache) {
    if (fs.existsSync(TENANTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TENANTS_FILE, "utf-8"));
      cache = hydrateTenants(parsed);
    } else {
      cache = hydrateTenants({ default: buildDefaultTenant() });
      fs.mkdirSync(path.dirname(TENANTS_FILE), { recursive: true });
      fs.writeFileSync(TENANTS_FILE, JSON.stringify(cache, null, 2));
    }
  }
  return cache;
}

export function saveTenants(obj) {
  const normalized = hydrateTenants(obj);
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(normalized, null, 2));
  cache = normalized;
  return cache;
}

export function getTenantByKey(key) {
  const tenants = loadTenants();
  if (!key) return null;
  const t = tenants[key];
  if (!t) return null;
  return { key, ...t };
}

export function getTenantByPhoneNumberId(phoneNumberId) {
  const tenants = loadTenants();
  for (const [key, t] of Object.entries(tenants)) {
    if (t.phoneNumberId === phoneNumberId) return { key, ...t };
  }
  const d = tenants.default;
  return { key: "default", ...d };
}

export async function registerTenant({ displayName, wabaToken, phoneNumberId, graphVersion = "v20.0", calendar = {}, services = [] }) {
  if (!displayName || !wabaToken || !phoneNumberId) throw new Error("displayName, wabaToken, phoneNumberId are required");
  const tenants = loadTenants();
  for (const [key, t] of Object.entries(tenants)) {
    if (t.phoneNumberId === phoneNumberId) return key;
  }
  const tenantKey = (displayName || "tenant").toLowerCase().replace(/\W+/g, "-") + "-" + uuidv4().slice(0, 8);
  tenants[tenantKey] = {
    displayName, wabaToken, phoneNumberId, graphVersion,
    services: normalizeServices(services),
    calendar: {
      ...ensureCalendarDefaults(calendar)
    }
  };
  saveTenants(tenants);
  return tenantKey;
}

export function getServiceById(tenant, serviceId) {
  if (!tenant?.services?.length || !serviceId) return null;
  return tenant.services.find(s => s.id === serviceId) || null;
}

export function normalizeServices(services) {
  if (!Array.isArray(services) || !services.length) {
    return DEFAULT_SERVICES.map(cloneService);
  }
  return services.map((svc) => {
    const idCandidate = svc.id || svc.name?.toLowerCase().replace(/\W+/g, "-") || `svc-${uuidv4().slice(0, 6)}`;
    const min = Number(svc.minMinutes || svc.durationMinutes || 30);
    const maxRaw = Number(svc.maxMinutes || svc.durationMinutes || svc.minMinutes || 45);
    const max = Math.max(maxRaw, min);
    return {
      id: idCandidate,
      name: svc.name || "Service",
      minMinutes: min,
      maxMinutes: max,
      price: Number(svc.price || 0),
      currency: svc.currency || "USD",
      description: svc.description || "",
      keywords: Array.isArray(svc.keywords) ? svc.keywords.map(k => String(k).toLowerCase()) : []
    };
  });
}

function cloneService(svc) {
  return { ...svc, keywords: Array.isArray(svc.keywords) ? [...svc.keywords] : [] };
}

export function findServiceByText(tenant, text) {
  if (!tenant?.services?.length || !text) return null;
  const lower = text.toLowerCase();
  return tenant.services.find((svc) => {
    if (lower.includes((svc.id || "").toLowerCase())) return true;
    if (svc.name && lower.includes(svc.name.toLowerCase())) return true;
    if (svc.keywords?.some((kw) => lower.includes(kw))) return true;
    return false;
  }) || null;
}

export function getDefaultService(tenant) {
  if (!tenant?.services?.length) return null;
  return tenant.services[0];
}
