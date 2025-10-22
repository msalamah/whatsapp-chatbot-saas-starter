import { DateTime, Interval } from "luxon";
import { google } from "googleapis";
import { getGoogleClient } from "../config/googleClient.js";
import { logger } from "../utils/logger.js";

const DEFAULT_WORKING_HOURS = [
  { day: 1, start: "09:00", end: "17:00" }, // Monday
  { day: 2, start: "09:00", end: "17:00" },
  { day: 3, start: "09:00", end: "17:00" },
  { day: 4, start: "09:00", end: "17:00" },
  { day: 5, start: "09:00", end: "17:00" }, // Friday
  { day: 6, start: "10:00", end: "14:00" }  // Saturday
];

export async function getAvailableSlots(tenant, options = {}) {
  const calendarCfg = tenant?.calendar || {};
  const timezone = calendarCfg.timezone || "UTC";
  const windowDays = options.windowDays || 3;
  const limit = options.limit || 3;
  const slotDurationMinutes = calendarCfg.slotDurationMinutes || 45;

  const now = (options.start
    ? DateTime.fromISO(options.start, { zone: timezone })
    : DateTime.now().setZone(timezone)).plus({ minutes: 5 });
  const windowEnd = now.plus({ days: windowDays });
  const workingHours = calendarCfg.workingHours?.length ? calendarCfg.workingHours : DEFAULT_WORKING_HOURS;

  const busyIntervals = calendarCfg.enabled
    ? await fetchBusyIntervals(tenant, now, windowEnd, timezone)
    : [];

  const slots = buildSlots({
    now,
    windowEnd,
    workingHours,
    durationMinutes: slotDurationMinutes,
    timezone,
    busyIntervals
  });

  return slots.slice(0, limit);
}

async function fetchBusyIntervals(tenant, start, end, timezone) {
  try {
    const auth = await getGoogleClient(tenant.calendar.oauthClient, tenant.calendar.tokenFile);
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = tenant.calendar.calendarId || "primary";
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toUTC().toISO(),
        timeMax: end.toUTC().toISO(),
        timeZone: timezone,
        items: [{ id: calendarId }]
      }
    });
    const busy = res.data.calendars?.[calendarId]?.busy || [];
    return busy.map(interval => Interval.fromDateTimes(
      DateTime.fromISO(interval.start, { zone: timezone }),
      DateTime.fromISO(interval.end, { zone: timezone })
    ));
  } catch (err) {
    logger.warn("Failed to fetch calendar availability; falling back to working hours", "calendar", { error: err.message });
    return [];
  }
}

function buildSlots({ now, windowEnd, workingHours, durationMinutes, timezone, busyIntervals }) {
  const slots = [];
  let cursorDay = now.startOf("day");
  while (cursorDay < windowEnd) {
    const dayWorking = workingHours.filter(wh => normalizeDay(wh.day) === cursorDay.weekday);
    for (const wh of dayWorking) {
      const dayStart = cursorDay.set(parseTime(wh.start));
      const dayEnd = cursorDay.set(parseTime(wh.end));
      if (dayEnd <= now) continue;
      let slotStart = DateTime.max(dayStart, now);
      slotStart = alignToDuration(slotStart, dayStart, durationMinutes);
      while (slotStart < dayEnd && slotStart < windowEnd) {
        const slotEnd = slotStart.plus({ minutes: durationMinutes });
        if (slotEnd > dayEnd || slotEnd > windowEnd) break;
        const slotInterval = Interval.fromDateTimes(slotStart, slotEnd);
        const isBusy = busyIntervals.some(interval => interval.overlaps(slotInterval));
        if (!isBusy) {
          slots.push({
            startISO: slotStart.toUTC().toISO(),
            endISO: slotEnd.toUTC().toISO(),
            displayLabel: slotStart.setZone(timezone).toFormat("ccc MMM d · HH:mm"),
            buttonLabel: slotStart.setZone(timezone).toFormat("ccc HH:mm"),
            timezone
          });
        }
        slotStart = slotStart.plus({ minutes: durationMinutes });
      }
    }
    cursorDay = cursorDay.plus({ days: 1 }).startOf("day");
  }
  return slots;
}

function parseTime(timeStr) {
  const [hour, minute] = timeStr.split(":").map(Number);
  return { hour, minute, second: 0, millisecond: 0 };
}

function normalizeDay(day) {
  if (day === 0) return 7; // convert Sunday 0 to 7 to match Luxon
  return day;
}

function alignToDuration(candidate, anchor, durationMinutes) {
  if (candidate <= anchor) return anchor;
  const diffMinutes = Math.ceil(candidate.diff(anchor, "minutes").minutes / durationMinutes) * durationMinutes;
  return anchor.plus({ minutes: diffMinutes }).startOf("minute");
}
