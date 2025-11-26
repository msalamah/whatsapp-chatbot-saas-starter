import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initializeDatabase, query } from "../src/db/client.js";
import { pruneExpiredData } from "../src/services/dataRetentionService.js";

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await query("DELETE FROM pending_bookings");
  await query("DELETE FROM appointments");
  await query("DELETE FROM customers");
  process.env.PENDING_RETENTION_HOURS = "24";
  process.env.APPOINTMENT_RETENTION_DAYS = "90";
  process.env.CUSTOMER_RETENTION_DAYS = "120";
});

describe("data retention", () => {
  it("removes stale pending bookings, appointments, and orphaned customers", async () => {
    await query(
      `INSERT INTO pending_bookings (
        customer_id, tenant_key, event_id, start_iso, end_iso, slot_label, time_zone,
        service_id, service_name, service_price, service_currency, service_description,
        duration_minutes, data, updated_at
      ) VALUES
        ('stale', 'default', 'evt', '2023-01-01T00:00:00Z', '2023-01-01T01:00:00Z', 'slot', 'UTC',
         'svc', 'Service', 0, 'USD', '', 30, '{}'::jsonb, '2023-01-01T00:00:00Z'),
        ('fresh', 'default', 'evt2', '2024-01-10T00:00:00Z', '2024-01-10T01:00:00Z', 'slot', 'UTC',
         'svc', 'Service', 0, 'USD', '', 30, '{}'::jsonb, '2024-01-09T23:00:00Z')`
    );

    await query(
      `INSERT INTO customers (id, tenant_key, display_name, metadata, updated_at)
       VALUES
        ('stale-customer', 'default', 'Stale', '{}'::jsonb, '2023-01-01T00:00:00Z'),
        ('active-customer', 'default', 'Active', '{}'::jsonb, '2024-01-09T00:00:00Z'),
        ('stale-with-future', 'default', 'Future', '{}'::jsonb, '2023-01-01T00:00:00Z')`
    );

    await query(
      `INSERT INTO appointments (id, tenant_key, customer_id, service_id, service_name, start_iso, end_iso, slot_label, notes, created_at)
       VALUES
        ('old-appt', 'default', 'stale-customer', 'svc', 'Service', '2023-01-01T00:00:00Z', '2023-01-01T01:00:00Z', 'slot', NULL, now()),
        ('recent-appt', 'default', 'active-customer', 'svc', 'Service', '2023-12-31T10:00:00Z', '2023-12-31T11:00:00Z', 'slot', NULL, now()),
        ('future-appt', 'default', 'stale-with-future', 'svc', 'Service', '2024-12-01T10:00:00Z', '2024-12-01T11:00:00Z', 'slot', NULL, now())`
    );

    const summary = await pruneExpiredData({ now: new Date("2024-01-10T12:00:00Z") });
    expect(summary.pendingBookings).toBe(1);
    expect(summary.appointments).toBe(1);
    expect(summary.customers).toBe(1);

    const pending = await query("SELECT COUNT(*) FROM pending_bookings");
    expect(Number(pending.rows[0].count)).toBe(1);

    const appointments = await query("SELECT COUNT(*) FROM appointments");
    expect(Number(appointments.rows[0].count)).toBe(2);

    const customers = await query("SELECT id FROM customers ORDER BY id");
    expect(customers.rows.map((row) => row.id)).toEqual(["active-customer", "stale-with-future"]);
  });
});
