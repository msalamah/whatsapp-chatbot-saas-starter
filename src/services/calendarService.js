import { v4 as uuid } from "uuid";
import { query } from "../db/client.js";
import { logger } from "../utils/logger.js";

export async function upsertCalendar(tenantKey, { timezone, capacity, lookaheadDays, rules = [], blocks = [] }) {
  await query(
    `INSERT INTO calendars (tenant_key, timezone, capacity, lookahead_days)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (tenant_key) DO UPDATE SET timezone = EXCLUDED.timezone, capacity = EXCLUDED.capacity, lookahead_days = EXCLUDED.lookahead_days, updated_at = now()`,
    [tenantKey, timezone || "UTC", capacity || 1, lookaheadDays || 30]
  );
  await query("DELETE FROM calendar_rules WHERE tenant_key = $1", [tenantKey]);
  for (const rule of rules) {
    const id = uuid();
    await query(
      `INSERT INTO calendar_rules (id, tenant_key, day_of_week, start_time, end_time, capacity)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, tenantKey, rule.dayOfWeek, rule.start, rule.end, rule.capacity || null]
    );
  }
  await query("DELETE FROM calendar_blocks WHERE tenant_key = $1", [tenantKey]);
  for (const block of blocks) {
    const id = uuid();
    await query(
      `INSERT INTO calendar_blocks (id, tenant_key, start_iso, end_iso, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, tenantKey, block.startISO, block.endISO, block.reason || null]
    );
  }
  return getCalendar(tenantKey);
}

export async function getCalendar(tenantKey) {
  const calRes = await query("SELECT * FROM calendars WHERE tenant_key = $1", [tenantKey]);
  const base = calRes.rows[0] || null;
  const rulesRes = await query("SELECT * FROM calendar_rules WHERE tenant_key = $1 ORDER BY day_of_week", [tenantKey]);
  const blocksRes = await query("SELECT * FROM calendar_blocks WHERE tenant_key = $1 ORDER BY start_iso", [tenantKey]);
  return {
    timezone: base?.timezone || "UTC",
    capacity: base?.capacity || 1,
    lookaheadDays: base?.lookahead_days || 30,
    rules: rulesRes.rows.map((row) => ({
      id: row.id,
      dayOfWeek: row.day_of_week,
      start: row.start_time,
      end: row.end_time,
      capacity: row.capacity
    })),
    blocks: blocksRes.rows.map((row) => ({
      id: row.id,
      startISO: row.start_iso,
      endISO: row.end_iso,
      reason: row.reason
    }))
  };
}

// Temporary stubs while the internal calendar is being built out.
// These keep existing booking/approval flows working without depending on Google Calendar.
const memoryEvents = new Map();

export async function createTentativeEvent(_tenant, summary, startISO, endISO, description = "", attendees = []) {
  const id = `evt_${uuid()}`;
  memoryEvents.set(id, { id, summary, startISO, endISO, description, attendees, status: "tentative" });
  return memoryEvents.get(id);
}

export async function confirmEvent(_tenant, eventId) {
  if (!eventId) return { skipped: true };
  const evt = memoryEvents.get(eventId);
  if (evt) {
    evt.status = "confirmed";
    return evt;
  }
  logger.debug?.("confirmEvent called for missing event", { eventId });
  return { skipped: true };
}

export async function cancelEvent(_tenant, eventId) {
  if (!eventId) return { skipped: true };
  const existed = memoryEvents.delete(eventId);
  if (!existed) {
    logger.debug?.("cancelEvent called for missing event", { eventId });
  }
  return { ok: true };
}
