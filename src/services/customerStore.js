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
