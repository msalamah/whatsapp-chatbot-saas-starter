import { DateTime, Interval } from "luxon";
import { logger } from "../utils/logger.js";
import { getCalendar } from "./calendarService.js";
import { listAppointmentsBetween } from "./appointmentStore.js";
import { listPendingByTenant } from "./pendingBookingStore.js";

const DEFAULT_WORKING_HOURS = [
  { day: 1, start: "09:00", end: "17:00", capacity: null }, // Monday
  { day: 2, start: "09:00", end: "17:00", capacity: null },
  { day: 3, start: "09:00", end: "17:00", capacity: null },
  { day: 4, start: "09:00", end: "17:00", capacity: null },
  { day: 5, start: "09:00", end: "17:00", capacity: null }, // Friday
  { day: 6, start: "10:00", end: "14:00", capacity: null }  // Saturday
];

export async function getAvailableSlots(tenant, options = {}) {
  const fallbackCalendar = tenant?.calendar || {};
  const calendarData = await loadInternalCalendar(tenant);
  const timezone = calendarData.timezone || fallbackCalendar.timezone || "UTC";
  const slotDurationMinutes = options.durationMinutes || fallbackCalendar.slotDurationMinutes || 45;
  const baseCapacity = Math.max(1, calendarData.capacity || 1);
  const lookaheadDays = options.windowDays || calendarData.lookaheadDays || 5;
  const limit = options.limit || 3;

  const actualNow = DateTime.now().setZone(timezone);
  const requestedStartValue = options.from || options.start;
  const requestedEndValue = options.to || options.end;
  const hasExplicitStart = Boolean(requestedStartValue);
  const initialStart = requestedStartValue ? DateTime.fromISO(requestedStartValue, { zone: timezone }) : actualNow;
  const windowStart = hasExplicitStart ? initialStart : DateTime.max(actualNow.plus({ minutes: 5 }), initialStart);
  const requestedEnd = requestedEndValue ? DateTime.fromISO(requestedEndValue, { zone: timezone }) : windowStart.plus({ days: lookaheadDays });
  const windowEnd = requestedEnd <= windowStart ? windowStart.plus({ hours: 1 }) : requestedEnd;

  const workingHours = calendarData.rules.length
    ? calendarData.rules
    : (fallbackCalendar.workingHours?.length ? fallbackCalendar.workingHours : DEFAULT_WORKING_HOURS);

  const busyEntries = await collectBusyEntries({
    tenant,
    windowStart,
    windowEnd,
    timezone,
    blocks: calendarData.blocks
  });

  const slots = buildSlots({
    now: windowStart,
    windowEnd,
    workingHours,
    durationMinutes: slotDurationMinutes,
    timezone,
    busyEntries,
    capacity: baseCapacity
  });

  return slots.slice(0, limit);
}

async function collectBusyEntries({ tenant, windowStart, windowEnd, timezone, blocks = [] }) {
  const entries = [];

  for (const block of blocks) {
    if (!block.startISO || !block.endISO) continue;
    const start = DateTime.fromISO(block.startISO, { zone: timezone });
    const end = DateTime.fromISO(block.endISO, { zone: timezone });
    if (!start.isValid || !end.isValid) continue;
    const interval = Interval.fromDateTimes(start, end);
    if (interval.end <= windowStart || interval.start >= windowEnd) continue;
    entries.push({ interval, capacity: Number.MAX_SAFE_INTEGER });
  }

  if (tenant?.key) {
    try {
      const appts = await listAppointmentsBetween(
        tenant.key,
        windowStart.toUTC().toISO(),
        windowEnd.toUTC().toISO()
      );
      for (const appt of appts) {
        if (!appt.start_iso || !appt.end_iso) continue;
        const start = DateTime.fromISO(appt.start_iso, { zone: timezone });
        const end = DateTime.fromISO(appt.end_iso || appt.start_iso, { zone: timezone });
        if (!start.isValid || !end.isValid) continue;
        entries.push({ interval: Interval.fromDateTimes(start, end), capacity: 1 });
      }
    } catch (err) {
      logger.warn("Failed to load appointments for availability", "calendar", { error: err.message });
    }

    try {
      const pending = await listPendingByTenant(tenant.key);
      for (const record of pending) {
        if (!record.startISO || !record.endISO) continue;
        const start = DateTime.fromISO(record.startISO, { zone: timezone });
        const end = DateTime.fromISO(record.endISO || record.startISO, { zone: timezone });
        if (!start.isValid || !end.isValid) continue;
        const interval = Interval.fromDateTimes(start, end);
        if (interval.end <= windowStart || interval.start >= windowEnd) continue;
        entries.push({ interval, capacity: 1 });
      }
    } catch (err) {
      logger.warn("Failed to load pending bookings for availability", "calendar", { error: err.message });
    }
  }

  return entries;
}

function buildSlots({ now, windowEnd, workingHours, durationMinutes, timezone, busyEntries, capacity }) {
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
      const windowLimit = wh.capacity && wh.capacity > 0 ? wh.capacity : capacity;
      while (slotStart < dayEnd && slotStart < windowEnd) {
        const slotEnd = slotStart.plus({ minutes: durationMinutes });
        if (slotEnd > dayEnd || slotEnd > windowEnd) break;
        const slotInterval = Interval.fromDateTimes(slotStart, slotEnd);
        if (hasCapacity(slotInterval, busyEntries, windowLimit)) {
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

function hasCapacity(slotInterval, busyEntries, capacity) {
  let used = 0;
  for (const entry of busyEntries) {
    if (entry.interval.overlaps(slotInterval)) {
      if (entry.capacity >= Number.MAX_SAFE_INTEGER) {
        return false;
      }
      used += entry.capacity || 1;
      if (used >= capacity) {
        return false;
      }
    }
  }
  return true;
}

async function loadInternalCalendar(tenant) {
  if (!tenant?.key) {
    return {
      timezone: tenant?.calendar?.timezone || "UTC",
      capacity: 1,
      lookaheadDays: tenant?.calendar?.lookaheadDays || 5,
      rules: [],
      blocks: []
    };
  }
  try {
    const calendar = await getCalendar(tenant.key);
    return {
      timezone: calendar.timezone || tenant?.calendar?.timezone || "UTC",
      capacity: calendar.capacity || 1,
      lookaheadDays: calendar.lookaheadDays || tenant?.calendar?.lookaheadDays || 5,
      rules: (calendar.rules || []).map((rule) => ({
        day: rule.dayOfWeek,
        start: rule.start,
        end: rule.end,
        capacity: rule.capacity ?? null
      })),
      blocks: calendar.blocks || []
    };
  } catch (err) {
    logger.warn("Failed to load internal calendar; using tenant defaults", "calendar", { error: err.message });
    return {
      timezone: tenant?.calendar?.timezone || "UTC",
      capacity: 1,
      lookaheadDays: tenant?.calendar?.lookaheadDays || 5,
      rules: [],
      blocks: []
    };
  }
}
