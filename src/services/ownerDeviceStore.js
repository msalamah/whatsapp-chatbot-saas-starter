import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

export async function upsertOwnerDevice({ ownerId, tenantKey, token, platform }) {
  if (!ownerId || !tenantKey || !token) {
    throw new Error("ownerId, tenantKey, and token are required");
  }
  await query(
    `INSERT INTO owner_devices (id, owner_id, tenant_key, token, platform, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (owner_id, tenant_key, token)
     DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()`,
    [uuidv4(), ownerId, tenantKey, token, platform || "unknown"]
  );
}

export async function getLatestOwnerDevice({ ownerId, tenantKey, platform }) {
  if (!ownerId || !tenantKey) {
    throw new Error("ownerId and tenantKey are required");
  }
  const res = await query(
    `SELECT * FROM owner_devices
     WHERE owner_id = $1 AND tenant_key = $2
     ${platform ? "AND platform = $3" : ""}
     ORDER BY updated_at DESC
     LIMIT 1`,
    platform ? [ownerId, tenantKey, platform] : [ownerId, tenantKey]
  );
  return res.rows[0] || null;
}
