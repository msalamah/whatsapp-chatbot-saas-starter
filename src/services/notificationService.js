import twilio from "twilio";
import nodemailer from "nodemailer";
import { logger } from "../utils/logger.js";

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

let mailTransport = null;
if (process.env.SMTP_HOST) {
  mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
}

export async function sendOtpSms({ to, code }) {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    logger.info("SMS OTP", "otp", { to, code, note: "Twilio not configured" });
    return;
  }
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
      body: `Your verification code is ${code}`
    });
  } catch (err) {
    logger.error("Failed to send OTP SMS", "otp", { to, error: err.message });
    throw err;
  }
}

export async function sendOtpEmail({ to, code }) {
  if (!mailTransport) {
    logger.info("Email OTP", "otp", { to, code, note: "SMTP not configured" });
    return;
  }
  try {
    await mailTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: "Your verification code",
      text: `Your verification code is ${code}`
    });
  } catch (err) {
    logger.error("Failed to send OTP email", "otp", { to, error: err.message });
    throw err;
  }
}

export async function sendSms({ to, body }) {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    logger.info("SMS", "sms", { to, body, note: "Twilio not configured" });
    return;
  }
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
      body
    });
  } catch (err) {
    logger.error("Failed to send SMS", "sms", { to, error: err.message });
    throw err;
  }
}
