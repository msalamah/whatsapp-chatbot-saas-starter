import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const TENANTS_FILE = path.resolve("src/tenants/tenants.json");
let cache = null;

export function loadTenants() {
  if (!cache) {
    if (fs.existsSync(TENANTS_FILE)) {
      cache = JSON.parse(fs.readFileSync(TENANTS_FILE, "utf-8"));
    } else {
      cache = {
        default: {
          displayName: "Demo Salon",
          wabaToken: process.env.WABA_TOKEN || "",
          phoneNumberId: process.env.PHONE_NUMBER_ID || "",
          graphVersion: process.env.GRAPH_VERSION || "v20.0",
          calendar: {
            enabled: false,
            oauthClient: "src/config/google_client_secret.json",
            tokenFile: "src/config/google_token_default.json",
            calendarId: "primary",
            timezone: "America/New_York",
            slotDurationMinutes: 45,
            workingHours: [
              { day: 1, start: "09:00", end: "17:00" },
              { day: 2, start: "09:00", end: "17:00" },
              { day: 3, start: "09:00", end: "17:00" },
              { day: 4, start: "09:00", end: "17:00" },
              { day: 5, start: "09:00", end: "17:00" },
              { day: 6, start: "10:00", end: "14:00" }
            ]
          }
        }
      };
      fs.mkdirSync(path.dirname(TENANTS_FILE), { recursive: true });
      fs.writeFileSync(TENANTS_FILE, JSON.stringify(cache, null, 2));
    }
  }
  return cache;
}

export function saveTenants(obj) {
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(obj, null, 2));
  cache = obj;
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

export async function registerTenant({ displayName, wabaToken, phoneNumberId, graphVersion = "v20.0", calendar = {} }) {
  if (!displayName || !wabaToken || !phoneNumberId) throw new Error("displayName, wabaToken, phoneNumberId are required");
  const tenants = loadTenants();
  for (const [key, t] of Object.entries(tenants)) {
    if (t.phoneNumberId === phoneNumberId) return key;
  }
  const tenantKey = (displayName || "tenant").toLowerCase().replace(/\W+/g, "-") + "-" + uuidv4().slice(0, 8);
  tenants[tenantKey] = {
    displayName, wabaToken, phoneNumberId, graphVersion,
    calendar: {
      enabled: !!calendar.enabled,
      oauthClient: calendar.oauthClient || "src/config/google_client_secret.json",
      tokenFile: calendar.tokenFile || "src/config/google_token_default.json",
      calendarId: calendar.calendarId || "primary",
      timezone: calendar.timezone || "UTC",
      slotDurationMinutes: calendar.slotDurationMinutes || 45,
      workingHours: calendar.workingHours?.length ? calendar.workingHours : [
        { day: 1, start: "09:00", end: "17:00" },
        { day: 2, start: "09:00", end: "17:00" },
        { day: 3, start: "09:00", end: "17:00" },
        { day: 4, start: "09:00", end: "17:00" },
        { day: 5, start: "09:00", end: "17:00" },
        { day: 6, start: "10:00", end: "14:00" }
      ]
    }
  };
  saveTenants(tenants);
  return tenantKey;
}
