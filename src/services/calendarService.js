import { google } from "googleapis";
import { getGoogleClient } from "../config/googleClient.js";
import { logger } from "../utils/logger.js";

export async function createTentativeEvent(tenant, summary, startISO, endISO, description = "", attendees = []) {
  if (!tenant.calendar?.enabled) { logger.info("[calendar] Disabled", "calendar", { tenant: tenant.displayName }); return { skipped: true }; }
  const auth = await getGoogleClient(tenant.calendar.oauthClient, tenant.calendar.tokenFile);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: tenant.calendar.calendarId || "primary",
    requestBody: { summary, description, start: { dateTime: startISO }, end: { dateTime: endISO }, attendees, status: "tentative" }
  });
  return res.data;
}

export async function confirmEvent(tenant, eventId) {
  if (!tenant.calendar?.enabled) return { skipped: true };
  const auth = await getGoogleClient(tenant.calendar.oauthClient, tenant.calendar.tokenFile);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.patch({ calendarId: tenant.calendar.calendarId || "primary", eventId, requestBody: { status: "confirmed" } });
  return res.data;
}

export async function cancelEvent(tenant, eventId) {
  if (!tenant.calendar?.enabled) return { skipped: true };
  const auth = await getGoogleClient(tenant.calendar.oauthClient, tenant.calendar.tokenFile);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: tenant.calendar.calendarId || "primary", eventId });
  return { ok: true };
}
