import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { getAvailableSlots } from "../src/services/availabilityService.js";

const tenant = {
  calendar: {
    enabled: false,
    timezone: "America/New_York",
    slotDurationMinutes: 30,
    workingHours: [
      { day: 1, start: "09:00", end: "12:00" },
      { day: 2, start: "09:00", end: "12:00" }
    ]
  }
};

describe("getAvailableSlots", () => {
  it("returns sequential slots within working hours", async () => {
    const start = DateTime.fromISO("2025-05-12T12:00:00Z"); // Monday
    const slots = await getAvailableSlots(tenant, {
      start: start.toISO(),
      windowDays: 1,
      limit: 3
    });

    expect(slots).toHaveLength(3);
    expect(slots[0].timezone).toBe("America/New_York");

    const firstStart = DateTime.fromISO(slots[0].startISO);
    const secondStart = DateTime.fromISO(slots[1].startISO);
    expect(Math.round(secondStart.diff(firstStart, "minutes").minutes)).toBe(30);

    const firstEnd = DateTime.fromISO(slots[0].endISO);
    expect(Math.round(firstEnd.diff(firstStart, "minutes").minutes)).toBe(30);
  });
});
