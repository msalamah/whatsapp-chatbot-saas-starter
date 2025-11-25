import { query } from "../db/client.js";

export async function generateCustomersCsv(tenantKey) {
  const res = await query(
    `SELECT id, display_name, phone, language, metadata, updated_at
     FROM customers
     WHERE tenant_key = $1
     ORDER BY updated_at DESC`,
    [tenantKey]
  );
  const header = "id,display_name,phone,language,updated_at";
  const rows = res.rows.map((row) => [row.id, row.display_name || "", row.phone || "", row.language || "", row.updated_at || ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header, ...rows].join("\n");
}

export async function generateAppointmentsCsv(tenantKey) {
  const res = await query(
    `SELECT customer_id, service_name, start_iso, end_iso, slot_label
     FROM appointments
     WHERE tenant_key = $1
     ORDER BY start_iso DESC`,
    [tenantKey]
  );
  const header = "customer_id,service_name,start_iso,end_iso,slot_label";
  const rows = res.rows.map((row) => [row.customer_id, row.service_name || "", row.start_iso || "", row.end_iso || "", row.slot_label || ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header, ...rows].join("\n");
}
