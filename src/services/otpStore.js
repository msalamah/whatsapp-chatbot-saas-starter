import { v4 as uuid } from "uuid";
import { query } from "../db/client.js";

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);

export async function createOtp({ tenantKey, contact, code, channel }) {
  const id = uuid();
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60000).toISOString();
  await query("DELETE FROM otps WHERE tenant_key = $1 AND contact = $2", [tenantKey, contact]);
  await query(
    "INSERT INTO otps (id, tenant_key, contact, channel, code, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, tenantKey, contact, channel, code, expires]
  );
  return { id, expiresAt: expires };
}

export async function verifyOtp({ tenantKey, contact, code }) {
  const res = await query(
    "SELECT * FROM otps WHERE tenant_key = $1 AND contact = $2 ORDER BY created_at DESC LIMIT 1",
    [tenantKey, contact]
  );
  if (!res.rowCount) throw new Error("OTP not found");
  const otp = res.rows[0];
  if (new Date(otp.expires_at) < new Date()) throw new Error("OTP expired");
  if (otp.code !== code) throw new Error("Invalid code");
  const token = uuid();
  await query("UPDATE otps SET verified = true, token = $1 WHERE id = $2", [token, otp.id]);
  return token;
}

export async function validateOtpToken({ tenantKey, contact, token }) {
  const res = await query(
    "SELECT * FROM otps WHERE tenant_key = $1 AND contact = $2 AND token = $3 AND verified = true ORDER BY created_at DESC LIMIT 1",
    [tenantKey, contact, token]
  );
  if (!res.rowCount) return false;
  const otp = res.rows[0];
  if (new Date(otp.expires_at) < new Date()) return false;
  return true;
}
