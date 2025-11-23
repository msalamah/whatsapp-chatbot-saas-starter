import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

const DEFAULT_SERVICES = [
  { id: "haircut", name: "Haircut", minMinutes: 30, maxMinutes: 45, price: 45, currency: "USD", description: "Wash, cut, and style", keywords: ["haircut", "cut", "trim"] },
  { id: "color", name: "Hair Color", minMinutes: 60, maxMinutes: 90, price: 120, currency: "USD", description: "Full color application", keywords: ["color", "dye", "highlights"] },
  { id: "mani", name: "Manicure", minMinutes: 40, maxMinutes: 60, price: 35, currency: "USD", description: "Manicure with polish", keywords: ["mani", "manicure", "nails"] }
];

function ensureCalendarDefaults(calendar = {}) {
  return {
    enabled: !!calendar.enabled,
    oauthClient: calendar.oauthClient || "src/config/google_client_secret.json",
    tokenFile: calendar.tokenFile || "src/config/google_token_default.json",
    calendarId: calendar.calendarId || "primary",
    timezone: calendar.timezone || "America/New_York",
    slotDurationMinutes: calendar.slotDurationMinutes ? Number(calendar.slotDurationMinutes) : 45,
    workingHours: Array.isArray(calendar.workingHours) && calendar.workingHours.length ? calendar.workingHours : [
      { day: 1, start: "09:00", end: "17:00" },
      { day: 2, start: "09:00", end: "17:00" },
      { day: 3, start: "09:00", end: "17:00" },
      { day: 4, start: "09:00", end: "17:00" },
      { day: 5, start: "09:00", end: "17:00" },
      { day: 6, start: "10:00", end: "14:00" }
    ]
  };
}

function generateOwnerToken() {
  return uuidv4().replace(/-/g, "");
}

function normalizeServices(services) {
  if (!Array.isArray(services) || !services.length) {
    return DEFAULT_SERVICES.map((svc) => ({ ...svc }));
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
      keywords: Array.isArray(svc.keywords) ? svc.keywords.map((k) => String(k).toLowerCase()) : (svc.keywords ? String(svc.keywords).split(",").map((k) => k.trim().toLowerCase()) : [])
    };
  });
}

async function attachServices(tenantRows) {
  if (!tenantRows.length) return [];
  const keys = tenantRows.map((t) => t.key);
  const res = await query("SELECT * FROM services WHERE tenant_key = ANY($1)", [keys]);
  const grouped = new Map();
  for (const row of res.rows) {
    if (!grouped.has(row.tenant_key)) grouped.set(row.tenant_key, []);
    grouped.get(row.tenant_key).push(formatServiceRow(row));
  }
  return tenantRows.map((row) => ({
    key: row.key,
    displayName: row.display_name,
    wabaToken: row.waba_token,
    phoneNumberId: row.phone_number_id,
    graphVersion: row.graph_version,
    calendar: ensureCalendarDefaults(row.calendar || {}),
    services: grouped.get(row.key) || [],
    ownerToken: row.owner_portal_token
  }));
}

async function ensureOwnerToken(tenant) {
  if (tenant.ownerToken) return tenant;
  const token = generateOwnerToken();
  await query("UPDATE tenants SET owner_portal_token = $1 WHERE key = $2", [token, tenant.key]);
  return { ...tenant, ownerToken: token };
}

function formatServiceRow(row) {
  return {
    id: row.id,
    name: row.name,
    minMinutes: row.min_minutes,
    maxMinutes: row.max_minutes,
    price: row.price ? Number(row.price) : 0,
    currency: row.currency || "USD",
    description: row.description || "",
    keywords: Array.isArray(row.keywords) ? row.keywords : (row.keywords ? row.keywords : [])
  };
}

export async function listTenants({ includeSensitive = false } = {}) {
  const res = await query("SELECT * FROM tenants ORDER BY key");
  let tenants = await attachServices(res.rows);
  tenants = await Promise.all(tenants.map((tenant) => ensureOwnerToken(tenant)));
  return tenants.map((tenant) => maskTenant(tenant, includeSensitive));
}

export async function getTenantSummary(key, { includeSensitive = false } = {}) {
  const res = await query("SELECT * FROM tenants WHERE key = $1", [key]);
  if (!res.rowCount) return null;
  let tenant = (await attachServices(res.rows))[0];
  tenant = await ensureOwnerToken(tenant);
  return maskTenant(tenant, includeSensitive);
}

export async function getTenantByKey(key) {
  const res = await query("SELECT * FROM tenants WHERE key = $1", [key]);
  if (!res.rowCount) return null;
  let tenant = (await attachServices(res.rows))[0];
  return await ensureOwnerToken(tenant);
}

export async function getTenantByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return await getTenantByKey("default");
  const res = await query("SELECT * FROM tenants WHERE phone_number_id = $1", [phoneNumberId]);
  if (!res.rowCount) return await getTenantByKey("default");
  let tenant = (await attachServices(res.rows))[0];
  return await ensureOwnerToken(tenant);
}

export async function registerTenant({ displayName, wabaToken, phoneNumberId, graphVersion = "v20.0", calendar = {}, services = [] }) {
  if (!displayName || !wabaToken || !phoneNumberId) throw new Error("displayName, wabaToken, phoneNumberId are required");
  const tenantKey = (displayName || "tenant").toLowerCase().replace(/\W+/g, "-") + "-" + uuidv4().slice(0, 8);
  const calendarPayload = ensureCalendarDefaults(calendar);
  await query(
    `INSERT INTO tenants (key, display_name, waba_token, phone_number_id, graph_version, calendar)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [tenantKey, displayName, wabaToken, phoneNumberId, graphVersion, JSON.stringify(calendarPayload)]
  );
  await replaceServices(tenantKey, services);
  return tenantKey;
}

export async function updateTenant(key, updates = {}) {
  if (!key) throw new Error("tenant key is required");
  const fields = [];
  const values = [];
  let idx = 1;
  if (updates.displayName !== undefined) {
    fields.push(`display_name = $${idx++}`);
    values.push(updates.displayName);
  }
  if (updates.wabaToken !== undefined && updates.wabaToken.trim()) {
    fields.push(`waba_token = $${idx++}`);
    values.push(updates.wabaToken.trim());
  }
  if (updates.phoneNumberId !== undefined) {
    fields.push(`phone_number_id = $${idx++}`);
    values.push(updates.phoneNumberId);
  }
  if (updates.graphVersion !== undefined) {
    fields.push(`graph_version = $${idx++}`);
    values.push(updates.graphVersion);
  }
  if (updates.calendar) {
    fields.push(`calendar = $${idx++}`);
    values.push(JSON.stringify(ensureCalendarDefaults(updates.calendar)));
  }
  if (fields.length) {
    values.push(key);
    await query(`UPDATE tenants SET ${fields.join(", ")}, updated_at = now() WHERE key = $${idx}`, values);
  }
  if (updates.services) {
    await replaceServices(key, updates.services);
  }
  if (updates.serviceUpdate) {
    await upsertService(key, updates.serviceUpdate);
  }
  if (updates.serviceDelete) {
    await query("DELETE FROM services WHERE tenant_key = $1 AND id = $2", [key, updates.serviceDelete]);
  }
  return await getTenantByKey(key);
}

export async function rotateTenantToken(key, newToken) {
  if (!key) throw new Error("tenant key is required");
  if (!newToken || !newToken.trim()) throw new Error("new token must be provided");
  await query("UPDATE tenants SET waba_token = $1, updated_at = now() WHERE key = $2", [newToken.trim(), key]);
  return await getTenantByKey(key);
}

export async function rotateOwnerPortalToken(key) {
  if (!key) throw new Error("tenant key is required");
  const newToken = generateOwnerToken();
  await query("UPDATE tenants SET owner_portal_token = $1, updated_at = now() WHERE key = $2", [newToken, key]);
  return newToken;
}

export async function deleteTenant(key) {
  if (!key) throw new Error("tenant key is required");
  await query("DELETE FROM tenants WHERE key = $1", [key]);
}

export function getServiceById(tenant, serviceId) {
  if (!tenant?.services?.length || !serviceId) return null;
  return tenant.services.find((s) => s.id === serviceId) || null;
}

export async function listServicesForTenantKey(key) {
  const tenant = await getTenantByKey(key);
  return tenant?.services || [];
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

async function replaceServices(tenantKey, services = []) {
  const normalized = normalizeServices(services);
  await query("DELETE FROM services WHERE tenant_key = $1", [tenantKey]);
  for (const svc of normalized) {
    await query(
      `INSERT INTO services (tenant_key, id, name, min_minutes, max_minutes, price, currency, description, keywords)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantKey, svc.id, svc.name, svc.minMinutes, svc.maxMinutes, svc.price, svc.currency, svc.description, JSON.stringify(svc.keywords || [])]
    );
  }
}

async function upsertService(tenantKey, service) {
  const normalized = normalizeServices([service])[0];
  await query(
    `INSERT INTO services (tenant_key, id, name, min_minutes, max_minutes, price, currency, description, keywords)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tenant_key, id) DO UPDATE SET
       name = EXCLUDED.name,
       min_minutes = EXCLUDED.min_minutes,
       max_minutes = EXCLUDED.max_minutes,
       price = EXCLUDED.price,
       currency = EXCLUDED.currency,
       description = EXCLUDED.description,
       keywords = EXCLUDED.keywords`,
    [tenantKey, normalized.id, normalized.name, normalized.minMinutes, normalized.maxMinutes, normalized.price, normalized.currency, normalized.description, JSON.stringify(normalized.keywords || [])]
  );
}

function maskTenant(tenant, includeSensitive) {
  return {
    ...tenant,
    wabaToken: includeSensitive ? tenant.wabaToken : undefined,
    wabaTokenPreview: tenant.wabaToken ? maskToken(tenant.wabaToken) : null,
    ownerToken: includeSensitive ? tenant.ownerToken : undefined,
    ownerTokenPreview: tenant.ownerToken ? maskToken(tenant.ownerToken) : null
  };
}

function maskToken(token) {
  if (!token) return null;
  const trimmed = token.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}
