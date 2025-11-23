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

export async function listCustomersForTenant(tenantKey, { limit = 50 } = {}) {
  const res = await query(
    `SELECT id, display_name, phone, language, metadata, updated_at
     FROM customers
     WHERE tenant_key = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [tenantKey, limit]
  );
  return res.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    language: row.language,
    metadata: row.metadata,
    updatedAt: row.updated_at
  }));
}
