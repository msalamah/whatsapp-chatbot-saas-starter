import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { savePendingBooking } from "../src/services/pendingBookingStore.js";
import { upsertOwner, linkOwnerToTenant } from "../src/services/ownerStore.js";
import { createOwnerOtp } from "../src/services/ownerOtpStore.js";
import { httpRequest } from "./helpers/httpClient.js";

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
    const loginRes = await httpRequest(app, {
      method: "POST",
      path: "/owner/login",
      body: { tenantKey: "default", token: "demo-owner-token" }
    });
    expect(loginRes.status).toBe(200);
    const login = loginRes.json();
    expect(login.token).toBeTruthy();
    expect(login.tenant?.calendarLink).toMatch(/https:\/\/calendar\.google\.com/);

    const pendingRes = await httpRequest(app, {
      path: "/owner/pending",
      headers: { Authorization: `Bearer ${login.token}` }
    });
    expect(pendingRes.status).toBe(200);
    const pending = pendingRes.json();
    expect(Array.isArray(pending.pending)).toBe(true);
    expect(pending.pending.length).toBeGreaterThan(0);

    const approveRes = await httpRequest(app, {
      method: "POST",
      path: "/owner/pending/5551/approve",
      headers: { Authorization: `Bearer ${login.token}` }
    });
    expect(approveRes.status).toBe(200);

    const appointmentsRes = await httpRequest(app, {
      path: "/owner/appointments?range=past&limit=10",
      headers: { Authorization: `Bearer ${login.token}` }
    });
    expect(appointmentsRes.status).toBe(200);
    const appointments = appointmentsRes.json();
    expect(Array.isArray(appointments.appointments)).toBe(true);
    expect(appointments.appointments.length).toBeGreaterThanOrEqual(1);

    const customersRes = await httpRequest(app, {
      path: "/owner/customers?q=demo&limit=10",
      headers: { Authorization: `Bearer ${login.token}` }
    });
    expect(customersRes.status).toBe(200);
    const customers = customersRes.json();
    expect(Array.isArray(customers.customers)).toBe(true);
    if (customers.customers.length) {
      const firstCustomer = customers.customers[0];
      const detailRes = await httpRequest(app, {
        path: `/owner/customers/${firstCustomer.id}`,
        headers: { Authorization: `Bearer ${login.token}` }
      });
      expect(detailRes.status).toBe(200);
      const detail = detailRes.json();
      expect(detail.customer.id).toBe(firstCustomer.id);
      expect(Array.isArray(detail.appointments)).toBe(true);
    }

    const servicesRes = await httpRequest(app, {
      path: "/owner/services",
      headers: { Authorization: `Bearer ${login.token}` }
    });
    expect(servicesRes.status).toBe(200);
    expect(Array.isArray(servicesRes.json().services)).toBe(true);
  });

  it("supports OTP login, refresh, and structured errors", async () => {
    const phone = "+15555550123";
    const tenantKey = "default";
    const owner = await upsertOwner({ phone, displayName: "Owner One" });
    await linkOwnerToTenant({ ownerId: owner.id, tenantKey, role: "owner" });

    const otpRequest = await httpRequest(app, {
      method: "POST",
      path: "/owner/auth/request-otp",
      body: { phone, tenantKey }
    });
    expect(otpRequest.status).toBe(200);
    const otpPayload = otpRequest.json();
    expect(otpPayload.status).toBe("sent");
    expect(otpPayload.tenantKey).toBe(tenantKey);
    expect(otpPayload.preauthToken).toBeTruthy();

    const tenantListRes = await httpRequest(app, {
      path: `/owner/tenants?phone=${encodeURIComponent(phone)}&token=${encodeURIComponent(otpPayload.preauthToken)}`
    });
    expect(tenantListRes.status).toBe(200);
    expect(Array.isArray(tenantListRes.json().tenants)).toBe(true);

    const otp = await createOwnerOtp({ phone, tenantKey });
    const verifyRes = await httpRequest(app, {
      method: "POST",
      path: "/owner/auth/verify-otp",
      body: { phone, tenantKey, code: otp.code }
    });
    expect(verifyRes.status).toBe(200);
    const verifyPayload = verifyRes.json();
    expect(verifyPayload.token).toBeTruthy();
    expect(verifyPayload.refreshToken).toBeTruthy();

    const refreshRes = await httpRequest(app, {
      method: "POST",
      path: "/owner/auth/refresh",
      body: { refreshToken: verifyPayload.refreshToken }
    });
    expect(refreshRes.status).toBe(200);
    const refreshPayload = refreshRes.json();
    expect(refreshPayload.token).toBeTruthy();
    expect(refreshPayload.refreshToken).toBeTruthy();

    const badPhoneRes = await httpRequest(app, {
      method: "POST",
      path: "/owner/auth/request-otp",
      body: { phone: "bad" }
    });
    expect(badPhoneRes.status).toBe(400);
    const badPhonePayload = badPhoneRes.json();
    expect(badPhonePayload.error?.code).toBeTruthy();
    expect(badPhonePayload.error?.message).toBeTruthy();
  });
});
