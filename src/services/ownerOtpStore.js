import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/client.js";

const OTP_TTL_MINUTES = Number(process.env.OWNER_OTP_TTL_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OWNER_OTP_MAX_ATTEMPTS || 5);
const OTP_LOCK_MINUTES = Number(process.env.OWNER_OTP_LOCK_MINUTES || 10);
const OTP_SECRET = process.env.OWNER_OTP_SECRET || process.env.OWNER_JWT_SECRET || "";

function hashCode(code) {
  return crypto.createHash("sha256").update(`${OTP_SECRET}:${code}`).digest("hex");
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOwnerOtp({ phone, tenantKey }) {
  const id = uuidv4();
  const code = generateCode();
  const codeHash = hashCode(code);
  const preauthToken = uuidv4();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60000).toISOString();
  await query("DELETE FROM owner_otps WHERE phone = $1 AND tenant_key = $2", [phone, tenantKey]);
  await query(
    `INSERT INTO owner_otps (id, phone, tenant_key, code_hash, preauth_token, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, phone, tenantKey, codeHash, preauthToken, expiresAt]
  );
  return { id, code, preauthToken, expiresAt };
}

export async function verifyOwnerOtp({ phone, tenantKey, code }) {
  const res = await query(
    `SELECT * FROM owner_otps
     WHERE phone = $1 AND tenant_key = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone, tenantKey]
  );
  if (!res.rowCount) throw new Error("OTP not found");
  const otp = res.rows[0];
  if (otp.locked_until && new Date(otp.locked_until) > new Date()) {
    throw new Error("OTP locked. Try again later.");
  }
  if (otp.verified) throw new Error("OTP already used");
  if (new Date(otp.expires_at) < new Date()) throw new Error("OTP expired");
  const nextAttempts = Number(otp.attempts || 0) + 1;
  if (hashCode(code) !== otp.code_hash) {
    const lockedUntil = nextAttempts >= OTP_MAX_ATTEMPTS
      ? new Date(Date.now() + OTP_LOCK_MINUTES * 60000).toISOString()
      : otp.locked_until;
    await query(
      "UPDATE owner_otps SET attempts = $1, locked_until = $2 WHERE id = $3",
      [nextAttempts, lockedUntil, otp.id]
    );
    throw new Error("Invalid code");
  }
  await query(
    "UPDATE owner_otps SET verified = true, verified_at = now() WHERE id = $1",
    [otp.id]
  );
  return { verified: true };
}

export async function validateOwnerPreauth({ phone, token }) {
  const res = await query(
    `SELECT * FROM owner_otps
     WHERE phone = $1 AND preauth_token = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone, token]
  );
  if (!res.rowCount) return false;
  const otp = res.rows[0];
  if (otp.locked_until && new Date(otp.locked_until) > new Date()) return false;
  if (new Date(otp.expires_at) < new Date()) return false;
  return true;
}
