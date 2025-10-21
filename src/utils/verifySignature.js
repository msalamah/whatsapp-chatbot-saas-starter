import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

export function verifyWebhook(req) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

export function verifySignature(req) {
  const APP_SECRET = process.env.APP_SECRET;
  if (!APP_SECRET) return true;
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", APP_SECRET);
  hmac.update(req.rawBody || "");
  const expected = "sha256=" + hmac.digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  catch { return false; }
}
