import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

export async function createAppointment({ tenantKey, customerId, serviceId, serviceName, startISO, endISO, slotLabel, notes = null }) {
  await query(
    `INSERT INTO appointments (id, tenant_key, customer_id, service_id, service_name, start_iso, end_iso, slot_label, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [uuidv4(), tenantKey, customerId, serviceId, serviceName, startISO, endISO, slotLabel, notes, "booked"]
  );
}

export async function listAppointmentsForTenant(tenantKey, { limit = 50, from = null, to = null } = {}) {
  const res = await query(
    `SELECT *
     FROM appointments
     WHERE tenant_key = $1
       AND status != 'cancelled'
       AND ($3::timestamptz IS NULL OR start_iso::timestamptz >= $3::timestamptz)
       AND ($4::timestamptz IS NULL OR start_iso::timestamptz <= $4::timestamptz)
     ORDER BY start_iso DESC
     LIMIT $2::int`,
    [tenantKey, limit, from, to]
  );
  return res.rows;
}

export async function listAppointmentsForCustomer(tenantKey, customerId, { limit = 20, offset = 0, from = null } = {}) {
  const res = await query(
    `SELECT *
     FROM appointments
     WHERE tenant_key = $1
       AND status != 'cancelled'
       AND customer_id = $2
       AND ($4::timestamptz IS NULL OR start_iso::timestamptz >= $4::timestamptz)
     ORDER BY start_iso DESC
     LIMIT $3::int
     OFFSET $5::int`,
    [tenantKey, customerId, limit, from, offset]
  );
  return res.rows;
}

export async function listAppointmentsBetween(tenantKey, from, to) {
  const res = await query(
    `SELECT *
     FROM appointments
     WHERE tenant_key = $1
       AND status != 'cancelled'
       AND start_iso::timestamptz >= $2::timestamptz
       AND start_iso::timestamptz <= $3::timestamptz
     ORDER BY start_iso ASC`,
    [tenantKey, from, to]
  );
  return res.rows;
}

export async function getAppointmentById({ tenantKey, appointmentId }) {
  const res = await query(
    `SELECT * FROM appointments WHERE tenant_key = $1 AND id = $2 LIMIT 1`,
    [tenantKey, appointmentId]
  );
  return res.rows[0] || null;
}

export async function cancelAppointment({ tenantKey, appointmentId, reason = null }) {
  const res = await query(
    `UPDATE appointments
     SET status = 'cancelled', cancelled_at = now(), cancelled_reason = $3
     WHERE tenant_key = $1 AND id = $2
     RETURNING *`,
    [tenantKey, appointmentId, reason]
  );
  return res.rows[0] || null;
}
