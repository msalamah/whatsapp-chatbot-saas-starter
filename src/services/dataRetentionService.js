import { query } from "../db/client.js";
import { logger } from "../utils/logger.js";

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

export function getRetentionConfig() {
  return {
    pendingRetentionHours: readNumber("PENDING_RETENTION_HOURS", 48),
    appointmentRetentionDays: readNumber("APPOINTMENT_RETENTION_DAYS", 730),
    customerRetentionDays: readNumber("CUSTOMER_RETENTION_DAYS", 365)
  };
}

function subtractDuration(now, amount, unit) {
  const ms = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000
  };
  const durationMs = ms[unit] * amount;
  return new Date(now.getTime() - durationMs).toISOString();
}

export async function pruneExpiredData({ now = new Date() } = {}) {
  const timestamp = now instanceof Date ? now : new Date(now);
  const config = getRetentionConfig();
  const summary = {
    pendingBookings: 0,
    appointments: 0,
    customers: 0,
    otps: 0,
    ownerOtps: 0
  };

  if (config.pendingRetentionHours > 0) {
    const cutoff = subtractDuration(timestamp, config.pendingRetentionHours, "hour");
    const res = await query("DELETE FROM pending_bookings WHERE updated_at < $1", [cutoff]);
    summary.pendingBookings = res.rowCount || 0;
  }

  if (config.appointmentRetentionDays > 0) {
    const cutoff = subtractDuration(timestamp, config.appointmentRetentionDays, "day");
    const res = await query("DELETE FROM appointments WHERE start_iso IS NOT NULL AND start_iso::timestamptz < $1", [cutoff]);
    summary.appointments = res.rowCount || 0;
  }

  if (config.customerRetentionDays > 0) {
    const cutoff = subtractDuration(timestamp, config.customerRetentionDays, "day");
    const doomed = await query(
      `SELECT c.id
       FROM customers c
       LEFT JOIN appointments a
         ON a.customer_id = c.id AND a.start_iso >= $1
       LEFT JOIN pending_bookings p
         ON p.customer_id = c.id
       WHERE c.updated_at < $1
         AND a.customer_id IS NULL
         AND p.customer_id IS NULL`,
      [cutoff]
    );
    if (doomed.rowCount) {
      const ids = doomed.rows.map((row) => row.id);
      const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
      await query(`DELETE FROM customers WHERE id IN (${placeholders})`, ids);
    }
    summary.customers = doomed.rowCount || 0;
  }

  const otpRes = await query("DELETE FROM otps WHERE expires_at IS NOT NULL AND expires_at < $1", [timestamp.toISOString()]);
  summary.otps = otpRes.rowCount || 0;

  const ownerOtpRes = await query("DELETE FROM owner_otps WHERE expires_at IS NOT NULL AND expires_at < $1", [timestamp.toISOString()]);
  summary.ownerOtps = ownerOtpRes.rowCount || 0;

  logger.info("data.retention", "maintenance", { summary, config });
  return summary;
}
