import { query } from "../db/client.js";

export async function upsertCustomer({ id, tenantKey, displayName = null, phone = null, language = null, metadata = null }) {
  if (!id) return;
  await query(
    `INSERT INTO customers (id, tenant_key, display_name, phone, language, metadata, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (id) DO UPDATE SET
       tenant_key = EXCLUDED.tenant_key,
       display_name = COALESCE(EXCLUDED.display_name, customers.display_name),
       phone = COALESCE(EXCLUDED.phone, customers.phone),
       language = COALESCE(EXCLUDED.language, customers.language),
       metadata = COALESCE(EXCLUDED.metadata, customers.metadata),
       updated_at = now()`,
    [id, tenantKey, displayName, phone, language, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function listCustomersForTenant(tenantKey, { limit = 50, search = "" } = {}) {
  const like = `%${search.toLowerCase()}%`;
  const res = await query(
    `SELECT c.id,
            c.display_name,
            c.phone,
            c.language,
            c.metadata,
            c.updated_at,
            COALESCE(a.appointment_count, 0) AS appointment_count,
            a.last_booking
     FROM customers c
     LEFT JOIN (
       SELECT customer_id,
              COUNT(*) AS appointment_count,
              MAX(start_iso) AS last_booking
       FROM appointments
       WHERE tenant_key = $1
       GROUP BY customer_id
     ) a ON a.customer_id = c.id
     WHERE c.tenant_key = $1
       AND ($3 = '' OR LOWER(c.display_name) LIKE $3 OR LOWER(c.phone) LIKE $3 OR c.id LIKE $3)
     ORDER BY c.updated_at DESC
     LIMIT $2::int`,
    [tenantKey, limit, search ? like : ""]
  );
  return res.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    language: row.language,
    metadata: row.metadata,
    updatedAt: row.updated_at,
    appointmentCount: Number(row.appointment_count || 0),
    lastBooking: row.last_booking
  }));
}
