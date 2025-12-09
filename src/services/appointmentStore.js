import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

export async function createAppointment({ tenantKey, customerId, serviceId, serviceName, startISO, endISO, slotLabel, notes = null }) {
  await query(
    `INSERT INTO appointments (id, tenant_key, customer_id, service_id, service_name, start_iso, end_iso, slot_label, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uuidv4(), tenantKey, customerId, serviceId, serviceName, startISO, endISO, slotLabel, notes]
  );
}

export async function listAppointmentsForTenant(tenantKey, { limit = 50, from = null, to = null } = {}) {
  const res = await query(
    `SELECT *
     FROM appointments
     WHERE tenant_key = $1
       AND ($3::timestamptz IS NULL OR start_iso::timestamptz >= $3::timestamptz)
       AND ($4::timestamptz IS NULL OR start_iso::timestamptz <= $4::timestamptz)
     ORDER BY start_iso DESC
     LIMIT $2::int`,
    [tenantKey, limit, from, to]
  );
  return res.rows;
}

export async function listAppointmentsForCustomer(tenantKey, customerId, { limit = 20 } = {}) {
  const res = await query(
    `SELECT *
     FROM appointments
     WHERE tenant_key = $1 AND customer_id = $2
     ORDER BY start_iso DESC
     LIMIT $3::int`,
    [tenantKey, customerId, limit]
  );
  return res.rows;
}

export async function listAppointmentsBetween(tenantKey, from, to) {
  const res = await query(
    `SELECT *
     FROM appointments
     WHERE tenant_key = $1
       AND start_iso::timestamptz >= $2::timestamptz
       AND start_iso::timestamptz <= $3::timestamptz
     ORDER BY start_iso ASC`,
    [tenantKey, from, to]
  );
  return res.rows;
}
