import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { savePendingBooking } from "../src/services/pendingBookingStore.js";

const app = createApp();

function defaultPending() {
  return {
    tenantKey: "default",
    eventId: "evt-1",
    startISO: new Date().toISOString(),
    endISO: new Date(Date.now() + 30 * 60000).toISOString(),
    slotLabel: "Thu Oct 23, 09:00",
    timeZone: "America/New_York",
    serviceId: "haircut",
    serviceName: "Haircut",
    durationMinutes: 45
  };
}

describe("Owner portal", () => {
  it("logs in and lists pending/appointments", async () => {
    await savePendingBooking("5551", defaultPending());
    const login = await request(app)
      .post("/owner/login")
      .send({ tenantKey: "default", token: "demo-owner-token" })
      .expect(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.tenant?.calendarLink).toMatch(/https:\/\/calendar\.google\.com/);

    const pending = await request(app)
      .get("/owner/pending")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(Array.isArray(pending.body.pending)).toBe(true);
    expect(pending.body.pending.length).toBeGreaterThan(0);

    await request(app)
      .post("/owner/pending/5551/approve")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    const appointments = await request(app)
      .get("/owner/appointments")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(Array.isArray(appointments.body.appointments)).toBe(true);
    expect(appointments.body.appointments.length).toBeGreaterThanOrEqual(1);
  });
});
