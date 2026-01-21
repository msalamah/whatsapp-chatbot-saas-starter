import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

const REFRESH_TTL_DAYS = Number(process.env.OWNER_REFRESH_TTL_DAYS || 30);
const REFRESH_SECRET = process.env.OWNER_REFRESH_SECRET || process.env.OWNER_JWT_SECRET || "";

function hashToken(token) {
  return crypto.createHash("sha256").update(`${REFRESH_SECRET}:${token}`).digest("hex");
}

export async function createOwnerRefreshToken({ ownerId, tenantKey, role = "owner" }) {
  if (!ownerId || !tenantKey) throw new Error("ownerId and tenantKey are required");
  const token = uuidv4();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await query(
    `INSERT INTO owner_refresh_tokens (id, owner_id, tenant_key, role, token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [uuidv4(), ownerId, tenantKey, role, tokenHash, expiresAt]
  );
  return { token, expiresAt };
}

export async function rotateOwnerRefreshToken({ token }) {
  const tokenHash = hashToken(token);
  const res = await query(
    `SELECT * FROM owner_refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [tokenHash]
  );
  if (!res.rowCount) throw new Error("Refresh token not found");
  const row = res.rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw new Error("Refresh token expired");
  }
  await query("UPDATE owner_refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
  const next = await createOwnerRefreshToken({
    ownerId: row.owner_id,
    tenantKey: row.tenant_key,
    role: row.role || "owner"
  });
  return { ownerId: row.owner_id, tenantKey: row.tenant_key, role: row.role || "owner", ...next };
}
