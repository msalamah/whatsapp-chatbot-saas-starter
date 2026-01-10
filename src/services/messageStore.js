import { v4 as uuid } from "uuid";
import { query } from "../db/client.js";

export async function getOrCreateConversation({ tenantKey, customerId }) {
  if (!tenantKey || !customerId) return null;
  const existing = await query(
    "SELECT id FROM conversations WHERE tenant_key = $1 AND customer_id = $2 LIMIT 1",
    [tenantKey, customerId]
  );
  if (existing.rowCount) return existing.rows[0].id;
  const id = uuid();
  await query(
    "INSERT INTO conversations (id, tenant_key, customer_id) VALUES ($1,$2,$3)",
    [id, tenantKey, customerId]
  );
  return id;
}

export async function logMessage({ tenantKey, customerId, sender, text, metadata = null }) {
  if (!tenantKey || !customerId || !text) return;
  const conversationId = await getOrCreateConversation({ tenantKey, customerId });
  if (!conversationId) return;
  const id = uuid();
  await query(
    `INSERT INTO messages (id, conversation_id, tenant_key, customer_id, sender, text, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, conversationId, tenantKey, customerId, sender, text, metadata ? JSON.stringify(metadata) : null]
  );
  await query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);
}
