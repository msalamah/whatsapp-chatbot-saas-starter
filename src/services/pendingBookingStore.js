import { query } from "../db/client.js";

export async function savePendingBooking(customerId, payload) {
  if (!customerId) throw new Error("customerId is required to save pending booking");
  const record = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  await query(
    `INSERT INTO pending_bookings (
      customer_id, tenant_key, event_id, start_iso, end_iso, slot_label, time_zone,
      service_id, service_name, service_price, service_currency, service_description, duration_minutes, data, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
    ON CONFLICT (customer_id) DO UPDATE SET
      tenant_key = EXCLUDED.tenant_key,
      event_id = EXCLUDED.event_id,
      start_iso = EXCLUDED.start_iso,
      end_iso = EXCLUDED.end_iso,
      slot_label = EXCLUDED.slot_label,
      time_zone = EXCLUDED.time_zone,
      service_id = EXCLUDED.service_id,
      service_name = EXCLUDED.service_name,
      service_price = EXCLUDED.service_price,
      service_currency = EXCLUDED.service_currency,
      service_description = EXCLUDED.service_description,
      duration_minutes = EXCLUDED.duration_minutes,
      data = EXCLUDED.data,
      updated_at = now()`,
    [
      customerId,
      payload.tenantKey,
      payload.eventId,
      payload.startISO,
      payload.endISO,
      payload.slotLabel,
      payload.timeZone,
      payload.serviceId,
      payload.serviceName,
      payload.servicePrice,
      payload.serviceCurrency,
      payload.serviceDescription,
      payload.durationMinutes,
      JSON.stringify(record)
    ]
  );
  return record;
}

export async function getPendingBooking(customerId) {
  const res = await query("SELECT data FROM pending_bookings WHERE customer_id = $1", [customerId]);
  if (!res.rowCount) return null;
  return res.rows[0].data;
}

export async function deletePendingBooking(customerId) {
  await query("DELETE FROM pending_bookings WHERE customer_id = $1", [customerId]);
}

export async function listPendingBookings() {
  const res = await query("SELECT customer_id, data FROM pending_bookings");
  const map = {};
  for (const row of res.rows) {
    map[row.customer_id] = row.data;
  }
  return map;
}
