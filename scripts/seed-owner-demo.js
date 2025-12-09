#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import { initializeDatabase } from "../src/db/client.js";
import { upsertCustomer } from "../src/services/customerStore.js";
import { savePendingBooking } from "../src/services/pendingBookingStore.js";
import { createAppointment } from "../src/services/appointmentStore.js";
import { getTenantByKey } from "../src/tenants/tenantManager.js";
import { upsertCalendar } from "../src/services/calendarService.js";

const tenantKey = process.argv[2] || process.env.SEED_TENANT_KEY || "default";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to seed demo data");
  process.exit(1);
}

async function seed() {
  await initializeDatabase();
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) {
    console.error(`Tenant not found: ${tenantKey}`);
    process.exit(1);
  }

  const now = new Date();
  const tz = tenant.calendar?.timezone || "UTC";

  // ensure internal calendar rules exist so owner portal/calendar editor demos look populated
  await upsertCalendar(tenantKey, {
    timezone: tz,
    capacity: 2,
    lookaheadDays: 14,
    rules: [
      { dayOfWeek: 1, start: "09:00", end: "18:00", capacity: 2 },
      { dayOfWeek: 2, start: "09:00", end: "18:00", capacity: 2 },
      { dayOfWeek: 3, start: "09:00", end: "18:00", capacity: 2 },
      { dayOfWeek: 4, start: "09:00", end: "18:00", capacity: 2 },
      { dayOfWeek: 5, start: "09:00", end: "16:00", capacity: 1 }
    ],
    blocks: [
      {
        startISO: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        endISO: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
        reason: "Team training"
      }
    ]
  });

  // customers
  const customers = [
    { id: "15550001111", displayName: "Maya Cohen", phone: "+1 555 000 1111", language: "en" },
    { id: "15550002222", displayName: "Alex Li", phone: "+1 555 000 2222", language: "en" },
    { id: "15550003333", displayName: "Dana Azulay", phone: "+1 555 000 3333", language: "he" }
  ];

  for (const c of customers) {
    await upsertCustomer({ ...c, tenantKey });
  }

  // pending booking (for approvals list)
  const startPending = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const endPending = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  await savePendingBooking("15550001111", {
    tenantKey,
    eventId: "evt-demo-pending",
    startISO: startPending,
    endISO: endPending,
    slotLabel: new Date(startPending).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz }),
    timeZone: tz,
    serviceId: tenant.services?.[0]?.id || null,
    serviceName: tenant.services?.[0]?.name || "Haircut",
    servicePrice: tenant.services?.[0]?.price || 50,
    serviceCurrency: tenant.services?.[0]?.currency || "USD",
    serviceDescription: tenant.services?.[0]?.description || "",
    durationMinutes: tenant.services?.[0]?.minMinutes || 45
  });

  // appointments (recent approvals and history)
  const appointments = [
    {
      id: "appt-demo-1",
      customer_id: "15550002222",
      service_id: tenant.services?.[0]?.id || "haircut",
      service_name: tenant.services?.[0]?.name || "Haircut",
      start_iso: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      end_iso: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 45 * 60000).toISOString(),
      slot_label: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz })
    },
    {
      id: "appt-demo-2",
      customer_id: "15550003333",
      service_id: tenant.services?.[1]?.id || tenant.services?.[0]?.id || "color",
      service_name: tenant.services?.[1]?.name || "Color",
      start_iso: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      end_iso: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 60 * 60000).toISOString(),
      slot_label: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz })
    }
  ];

  for (const appt of appointments) {
    await createAppointment({
      id: appt.id,
      tenantKey,
      customerId: appt.customer_id,
      serviceId: appt.service_id,
      serviceName: appt.service_name,
      startISO: appt.start_iso,
      endISO: appt.end_iso,
      slotLabel: appt.slot_label,
      notes: "Demo appointment"
    });
  }

  console.log(`Seeded demo data for tenant ${tenantKey}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
