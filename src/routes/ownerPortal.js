import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getTenantByKey, registerOwnerTenant, getServiceById } from "../tenants/tenantManager.js";
import { listPendingByTenant } from "../services/pendingBookingStore.js";
import { approvePendingBooking, rejectPendingBooking } from "../services/approvalService.js";
import {
  listAppointmentsForTenant,
  listAppointmentsForCustomer,
  createAppointment,
  getAppointmentById,
  cancelAppointment
} from "../services/appointmentStore.js";
import { listCustomersForTenant, getCustomerDetail } from "../services/customerStore.js";
import { listServicesForTenantKey, updateTenant } from "../tenants/tenantManager.js";
import { validateOwnerServiceUpdate } from "../tenants/tenantValidation.js";
import { ownerAuth, signOwnerToken } from "../middleware/ownerAuth.js";
import { generateCustomersCsv, generateAppointmentsCsv } from "../services/csvExport.js";
import { getOwnerAnalytics } from "../services/analyticsService.js";
import { getCalendar, upsertCalendar } from "../services/calendarService.js";
import { upsertCustomer } from "../services/customerStore.js";
import {
  listTenantsForPhone,
  getOwnerTenantLink,
  upsertOwner,
  linkOwnerToTenant,
  findOwnerById,
  findOwnerByPhone,
  updateOwnerById
} from "../services/ownerStore.js";
import { createOwnerOtp, validateOwnerPreauth, verifyOwnerOtp } from "../services/ownerOtpStore.js";
import { sendOtpSms, sendSms } from "../services/notificationService.js";
import { sendText } from "../services/whatsappService.js";
import { createOwnerRefreshToken, rotateOwnerRefreshToken } from "../services/ownerSessionStore.js";
import { createRateLimiter, ipRateLimiter } from "../middleware/rateLimit.js";
import { getLatestOwnerDevice, upsertOwnerDevice } from "../services/ownerDeviceStore.js";
import { deleteCustomerData } from "../services/privacyService.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";
import { sendWebPush } from "../services/webPushService.js";

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ownerHtmlPath = path.resolve(__dirname, "../../public/owner/index.html");

function buildCalendarLink(tenant) {
  if (!tenant?.calendar?.calendarId) return null;
  const encoded = encodeURIComponent(tenant.calendar.calendarId);
  return `https://calendar.google.com/calendar/u/0/r?cid=${encoded}`;
}

function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw).trim().replace(/\s+/g, "");
}

function isValidPhone(phone) {
  return /^\+?[1-9]\d{7,14}$/.test(phone);
}

function sendError(res, { code, message, status = 400, details }) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

async function buildOwnerProfile({ ownerId, tenantKey }) {
  const owner = await findOwnerById(ownerId);
  if (!owner) return null;
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) return null;
  return {
    owner: {
      id: owner.id,
      name: owner.display_name,
      phone: owner.phone,
      email: owner.email
    },
    tenant: {
      key: tenant.key,
      name: tenant.displayName,
      timezone: tenant.calendar?.timezone || "UTC"
    }
  };
}

const otpRequestIpLimiter = ipRateLimiter({
  windowMs: Number(process.env.OWNER_OTP_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.OWNER_OTP_IP_LIMIT || 5)
});
const otpRequestPhoneLimiter = createRateLimiter({
  windowMs: Number(process.env.OWNER_OTP_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.OWNER_OTP_PHONE_LIMIT || 3),
  keyGenerator: (req) => normalizePhone(req.body?.phone)
});
const otpVerifyIpLimiter = ipRateLimiter({
  windowMs: Number(process.env.OWNER_OTP_VERIFY_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.OWNER_OTP_VERIFY_IP_LIMIT || 10)
});
const otpVerifyPhoneLimiter = createRateLimiter({
  windowMs: Number(process.env.OWNER_OTP_VERIFY_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.OWNER_OTP_VERIFY_PHONE_LIMIT || 5),
  keyGenerator: (req) => normalizePhone(req.body?.phone)
});
const registerIpLimiter = ipRateLimiter({
  windowMs: Number(process.env.OWNER_REGISTER_WINDOW_MS || 60 * 60 * 1000),
  max: Number(process.env.OWNER_REGISTER_IP_LIMIT || 3)
});
const registerPhoneLimiter = createRateLimiter({
  windowMs: Number(process.env.OWNER_REGISTER_WINDOW_MS || 60 * 60 * 1000),
  max: Number(process.env.OWNER_REGISTER_PHONE_LIMIT || 2),
  keyGenerator: (req) => normalizePhone(req.body?.phone)
});

function normalizeCalendarPayload(payload = {}) {
  const timezone = String(payload.timezone || "UTC").trim() || "UTC";
  const capacity = Number(payload.capacity ?? 1);
  const lookaheadDays = Number(payload.lookaheadDays ?? 30);
  const rules = Array.isArray(payload.rules)
    ? payload.rules.map((rule) => {
        const day = Number(rule.dayOfWeek);
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          throw new Error("dayOfWeek must be between 0 and 6");
        }
        const start = String(rule.start || "").trim();
        const end = String(rule.end || "").trim();
        if (!start || !end) {
          throw new Error("Working hours must include start and end");
        }
        let ruleCapacity = null;
        if (rule.capacity !== undefined && rule.capacity !== null && rule.capacity !== "") {
          const parsed = Number(rule.capacity);
          if (!Number.isFinite(parsed) || parsed < 1) {
            throw new Error("Capacity override must be a positive number");
          }
          ruleCapacity = parsed;
        }
        return { dayOfWeek: day, start, end, capacity: ruleCapacity };
      })
    : [];
  const blocks = Array.isArray(payload.blocks)
    ? payload.blocks
        .filter((block) => block?.startISO && block?.endISO)
        .map((block) => ({
          startISO: String(block.startISO),
          endISO: String(block.endISO),
          reason: block.reason ? String(block.reason).slice(0, 120) : null
        }))
    : [];
  return {
    timezone,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 1,
    lookaheadDays: Number.isFinite(lookaheadDays) && lookaheadDays > 0 ? lookaheadDays : 30,
    rules,
    blocks
  };
}

function formatBookingDateTime(iso, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone || "UTC" });
}

router.post("/login", async (req, res) => {
  const { tenantKey, token } = req.body || {};
  if (!tenantKey || !token) {
    return res.status(400).json({ error: "tenantKey and token are required" });
  }
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant || tenant.ownerToken !== token) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const jwt = signOwnerToken({ tenantKey });
  return res.json({
    token: jwt,
    tenant: {
      key: tenant.key,
      name: tenant.displayName,
      calendarLink: buildCalendarLink(tenant)
    }
  });
});

router.post("/register", registerIpLimiter, registerPhoneLimiter, async (req, res) => {
  const displayName = String(req.body?.displayName || "").trim();
  const ownerName = String(req.body?.ownerName || "").trim();
  const phone = normalizePhone(req.body?.phone);
  const email = req.body?.email ? String(req.body.email).trim() : null;
  const timezone = req.body?.timezone ? String(req.body.timezone).trim() : "UTC";
  const services = Array.isArray(req.body?.services) ? req.body.services : [];

  if (!displayName || !ownerName || !phone) {
    return sendError(res, { code: "REGISTER_REQUIRED_FIELDS", message: "displayName, ownerName, and phone are required" });
  }
  if (!isValidPhone(phone)) {
    return sendError(res, { code: "PHONE_INVALID", message: "Valid phone is required" });
  }

  const existingTenants = await listTenantsForPhone(phone);
  if (existingTenants.length) {
    return sendError(res, { code: "PHONE_ALREADY_REGISTERED", message: "Phone already registered", status: 409 });
  }

  try {
    const tenantKey = await registerOwnerTenant({ displayName, timezone, services });
    const owner = await upsertOwner({
      phone,
      email,
      displayName: ownerName
    });
    await linkOwnerToTenant({ ownerId: owner.id, tenantKey, role: "owner" });
    await upsertCalendar(tenantKey, { timezone, capacity: 1, lookaheadDays: 30, rules: [], blocks: [] });

    const otp = await createOwnerOtp({ phone, tenantKey });
    await sendOtpSms({ to: phone, code: otp.code });

    return res.json({
      status: "sent",
      tenantKey,
      expiresAt: otp.expiresAt,
      preauthToken: otp.preauthToken
    });
  } catch (err) {
    return sendError(res, { code: "REGISTER_FAILED", message: err.message || "Failed to register owner" });
  }
});

router.post("/auth/request-otp", otpRequestIpLimiter, otpRequestPhoneLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const tenantKey = req.body?.tenantKey ? String(req.body.tenantKey).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return sendError(res, { code: "PHONE_INVALID", message: "Valid phone is required" });
  }
  const tenants = await listTenantsForPhone(phone);
  if (!tenants.length) {
    return sendError(res, { code: "OWNER_NOT_FOUND", message: "Owner not found for phone", status: 404 });
  }
  let resolvedTenantKey = tenantKey;
  if (tenantKey) {
    const link = await getOwnerTenantLink({ phone, tenantKey });
    if (!link) {
      return sendError(res, { code: "OWNER_NOT_LINKED", message: "Owner not linked to tenant", status: 404 });
    }
  } else if (tenants.length === 1) {
    resolvedTenantKey = tenants[0].key;
  } else {
    return res.status(409).json({
      error: { code: "TENANT_SELECTION_REQUIRED", message: "Tenant selection required" },
      tenants
    });
  }
  const otp = await createOwnerOtp({ phone, tenantKey: resolvedTenantKey });
  try {
    await sendOtpSms({ to: phone, code: otp.code });
  } catch (err) {
    return sendError(res, { code: "OTP_SEND_FAILED", message: "Failed to send OTP", status: 500 });
  }
  return res.json({
    status: "sent",
    tenantKey: resolvedTenantKey,
    expiresAt: otp.expiresAt,
    preauthToken: otp.preauthToken
  });
});

router.post("/auth/verify-otp", otpVerifyIpLimiter, otpVerifyPhoneLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const tenantKey = req.body?.tenantKey ? String(req.body.tenantKey).trim() : "";
  const code = req.body?.code ? String(req.body.code).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return sendError(res, { code: "PHONE_INVALID", message: "Valid phone is required" });
  }
  if (!tenantKey) {
    return sendError(res, { code: "TENANT_KEY_REQUIRED", message: "tenantKey is required" });
  }
  if (!code) {
    return sendError(res, { code: "OTP_CODE_REQUIRED", message: "code is required" });
  }
  try {
    await verifyOwnerOtp({ phone, tenantKey, code });
  } catch (err) {
    const message = err.message || "OTP verification failed";
    let codeValue = "OTP_INVALID";
    if (/not found/i.test(message)) codeValue = "OTP_NOT_FOUND";
    if (/expired/i.test(message)) codeValue = "OTP_EXPIRED";
    if (/locked/i.test(message)) codeValue = "OTP_LOCKED";
    if (/already used/i.test(message)) codeValue = "OTP_USED";
    return sendError(res, { code: codeValue, message });
  }
  const link = await getOwnerTenantLink({ phone, tenantKey });
  if (!link) {
    return sendError(res, { code: "OWNER_NOT_LINKED", message: "Owner not linked to tenant", status: 404 });
  }
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) {
    return sendError(res, { code: "TENANT_NOT_FOUND", message: "Tenant not found", status: 404 });
  }
  const jwt = signOwnerToken({ tenantKey, ownerId: link.owner_id, role: link.role || "owner" });
  const refresh = await createOwnerRefreshToken({
    ownerId: link.owner_id,
    tenantKey,
    role: link.role || "owner"
  });
  return res.json({
    token: jwt,
    refreshToken: refresh.token,
    tenant: {
      key: tenant.key,
      name: tenant.displayName,
      calendarLink: buildCalendarLink(tenant)
    }
  });
});

router.post("/auth/refresh", async (req, res) => {
  const refreshToken = req.body?.refreshToken ? String(req.body.refreshToken).trim() : "";
  if (!refreshToken) {
    return sendError(res, { code: "REFRESH_REQUIRED", message: "refreshToken is required" });
  }
  try {
    const rotated = await rotateOwnerRefreshToken({ token: refreshToken });
    const tenant = await getTenantByKey(rotated.tenantKey);
    if (!tenant) {
      return sendError(res, { code: "TENANT_NOT_FOUND", message: "Tenant not found", status: 404 });
    }
    const jwt = signOwnerToken({
      tenantKey: rotated.tenantKey,
      ownerId: rotated.ownerId,
      role: rotated.role || "owner"
    });
    return res.json({
      token: jwt,
      refreshToken: rotated.token,
      tenant: {
        key: tenant.key,
        name: tenant.displayName,
        calendarLink: buildCalendarLink(tenant)
      }
    });
  } catch (err) {
    return sendError(res, { code: "REFRESH_FAILED", message: err.message || "Refresh failed", status: 401 });
  }
});

router.post("/devices", ownerAuth, async (req, res) => {
  const subscription = req.body?.subscription || null;
  const token = subscription ? JSON.stringify(subscription) : String(req.body?.token || "").trim();
  const platform = subscription ? "webpush" : (req.body?.platform ? String(req.body.platform).trim() : "unknown");
  if (!req.owner?.ownerId) {
    return sendError(res, { code: "OWNER_REQUIRED", message: "Owner identity required", status: 401 });
  }
  if (!token) {
    return sendError(res, { code: "DEVICE_TOKEN_REQUIRED", message: "token is required" });
  }
  try {
    await upsertOwnerDevice({
      ownerId: req.owner.ownerId,
      tenantKey: req.owner.tenantKey,
      token,
      platform
    });
    return res.json({ status: "ok" });
  } catch (err) {
    return sendError(res, { code: "DEVICE_REGISTER_FAILED", message: err.message || "Failed to register device" });
  }
});

router.post("/devices/test", ownerAuth, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return sendError(res, { code: "FORBIDDEN", message: "Test push disabled", status: 403 });
  }
  if (!req.owner?.ownerId) {
    return sendError(res, { code: "OWNER_REQUIRED", message: "Owner identity required", status: 401 });
  }
  try {
    const device = await getLatestOwnerDevice({
      ownerId: req.owner.ownerId,
      tenantKey: req.owner.tenantKey,
      platform: "webpush"
    });
    if (!device) {
      return sendError(res, { code: "DEVICE_NOT_FOUND", message: "No web push subscription found", status: 404 });
    }
    const subscription = JSON.parse(device.token);
    await sendWebPush({
      subscription,
      payload: {
        title: "Owner portal test",
        body: "Web push is configured correctly."
      }
    });
    return res.json({ status: "sent" });
  } catch (err) {
    return sendError(res, { code: "PUSH_SEND_FAILED", message: err.message || "Failed to send web push" });
  }
});

router.get("/tenants", async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const token = req.query.token ? String(req.query.token).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return sendError(res, { code: "PHONE_INVALID", message: "Valid phone is required" });
  }
  if (!token) {
    return sendError(res, { code: "PREAUTH_REQUIRED", message: "token is required" });
  }
  const ok = await validateOwnerPreauth({ phone, token });
  if (!ok) {
    return sendError(res, { code: "PREAUTH_INVALID", message: "Unauthorized", status: 401 });
  }
  const tenants = await listTenantsForPhone(phone);
  return res.json({ tenants });
});

router.get("/portal", (_req, res) => {
  res.sendFile(ownerHtmlPath);
});

router.use(ownerAuth);

router.get("/profile", async (req, res) => {
  if (!req.owner?.ownerId) {
    return sendError(res, { code: "OWNER_REQUIRED", message: "Owner identity required", status: 401 });
  }
  const profile = await buildOwnerProfile({ ownerId: req.owner.ownerId, tenantKey: req.owner.tenantKey });
  if (!profile) {
    return sendError(res, { code: "OWNER_NOT_FOUND", message: "Owner profile not found", status: 404 });
  }
  res.json({ profile });
});

router.put("/profile", async (req, res) => {
  if (!req.owner?.ownerId) {
    return sendError(res, { code: "OWNER_REQUIRED", message: "Owner identity required", status: 401 });
  }
  const ownerName = req.body?.ownerName !== undefined ? String(req.body.ownerName || "").trim() : undefined;
  const email = req.body?.email !== undefined ? String(req.body.email || "").trim() : undefined;
  const businessName = req.body?.businessName !== undefined ? String(req.body.businessName || "").trim() : undefined;
  const timezone = req.body?.timezone !== undefined ? String(req.body.timezone || "").trim() : undefined;
  const rawPhone = req.body?.phone !== undefined ? normalizePhone(req.body.phone) : undefined;

  const owner = await findOwnerById(req.owner.ownerId);
  if (!owner) {
    return sendError(res, { code: "OWNER_NOT_FOUND", message: "Owner profile not found", status: 404 });
  }

  const emailValue = email === undefined ? undefined : email || null;
  if (ownerName !== undefined || emailValue !== undefined) {
    await updateOwnerById({
      ownerId: req.owner.ownerId,
      displayName: ownerName !== undefined ? ownerName : undefined,
      email: emailValue
    });
  }

  if (businessName !== undefined || timezone !== undefined) {
    const tenant = await getTenantByKey(req.owner.tenantKey);
    if (!tenant) {
      return sendError(res, { code: "TENANT_NOT_FOUND", message: "Tenant not found", status: 404 });
    }
    const calendar = timezone ? { ...tenant.calendar, timezone } : tenant.calendar;
    await updateTenant(req.owner.tenantKey, {
      ...(businessName ? { displayName: businessName } : {}),
      ...(timezone ? { calendar } : {})
    });
  }

  const phone = rawPhone ? rawPhone : undefined;
  const phoneChange = phone && phone !== owner.phone;
  if (phoneChange) {
    if (!isValidPhone(phone)) {
      return sendError(res, { code: "PHONE_INVALID", message: "Valid phone is required" });
    }
    const existing = await findOwnerByPhone(phone);
    if (existing && existing.id !== owner.id) {
      return sendError(res, { code: "PHONE_ALREADY_REGISTERED", message: "Phone already registered", status: 409 });
    }
    const otp = await createOwnerOtp({ phone, tenantKey: req.owner.tenantKey });
    try {
      await sendOtpSms({ to: phone, code: otp.code });
    } catch (err) {
      return sendError(res, { code: "OTP_SEND_FAILED", message: "Failed to send OTP", status: 500 });
    }
    const profile = await buildOwnerProfile({ ownerId: req.owner.ownerId, tenantKey: req.owner.tenantKey });
    return res.json({
      status: "phone_verification_required",
      phone,
      tenantKey: req.owner.tenantKey,
      expiresAt: otp.expiresAt,
      profile
    });
  }

  const profile = await buildOwnerProfile({ ownerId: req.owner.ownerId, tenantKey: req.owner.tenantKey });
  return res.json({ status: "updated", profile });
});

router.post("/profile/confirm-phone", otpVerifyPhoneLimiter, async (req, res) => {
  if (!req.owner?.ownerId) {
    return sendError(res, { code: "OWNER_REQUIRED", message: "Owner identity required", status: 401 });
  }
  const phone = normalizePhone(req.body?.phone);
  const code = req.body?.code ? String(req.body.code).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return sendError(res, { code: "PHONE_INVALID", message: "Valid phone is required" });
  }
  if (!code) {
    return sendError(res, { code: "OTP_CODE_REQUIRED", message: "code is required" });
  }
  try {
    await verifyOwnerOtp({ phone, tenantKey: req.owner.tenantKey, code });
  } catch (err) {
    const message = err.message || "OTP verification failed";
    let codeValue = "OTP_INVALID";
    if (/not found/i.test(message)) codeValue = "OTP_NOT_FOUND";
    if (/expired/i.test(message)) codeValue = "OTP_EXPIRED";
    if (/locked/i.test(message)) codeValue = "OTP_LOCKED";
    if (/already used/i.test(message)) codeValue = "OTP_USED";
    return sendError(res, { code: codeValue, message });
  }
  const existing = await findOwnerByPhone(phone);
  if (existing && existing.id !== req.owner.ownerId) {
    return sendError(res, { code: "PHONE_ALREADY_REGISTERED", message: "Phone already registered", status: 409 });
  }
  await updateOwnerById({ ownerId: req.owner.ownerId, phone });
  const profile = await buildOwnerProfile({ ownerId: req.owner.ownerId, tenantKey: req.owner.tenantKey });
  return res.json({ status: "phone_updated", profile });
});

router.get("/pending", async (req, res) => {
  const tenantKey = req.owner.tenantKey;
  const pending = await listPendingByTenant(tenantKey);
  res.json({ pending });
});

router.get("/appointments", async (req, res) => {
  const { limit = 50, range = "all", from, to } = req.query;
  let fromISO = from ? new Date(String(from)).toISOString() : null;
  let toISO = to ? new Date(String(to)).toISOString() : null;
  if (!fromISO && range === "upcoming") {
    fromISO = new Date().toISOString();
  }
  if (!toISO && range === "past") {
    toISO = new Date().toISOString();
  }
  const appointments = await listAppointmentsForTenant(req.owner.tenantKey, {
    limit: Number(limit) || 50,
    from: fromISO,
    to: toISO
  });
  res.json({ appointments });
});

router.get("/customers", async (req, res) => {
  const { limit = 100, q = "", offset = 0 } = req.query;
  const limitNum = Number(limit) || 100;
  const offsetNum = Number(offset) || 0;
  const customers = await listCustomersForTenant(req.owner.tenantKey, {
    limit: limitNum,
    search: String(q),
    offset: offsetNum
  });
  const hasMore = customers.length === limitNum;
  res.json({ customers, hasMore });
});

router.get("/customers/:customerId", async (req, res) => {
  const { limit = 20, offset = 0, range = "all" } = req.query;
  const customer = await getCustomerDetail(req.owner.tenantKey, req.params.customerId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  let from = null;
  if (range === "30d") {
    from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === "90d") {
    from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }

  const limitNum = Number(limit) || 20;
  const offsetNum = Number(offset) || 0;
  const appointments = await listAppointmentsForCustomer(req.owner.tenantKey, req.params.customerId, {
    limit: limitNum,
    offset: offsetNum,
    from
  });
  const hasMore = appointments.length === limitNum;
  res.json({ customer, appointments, hasMore });
});

router.get("/services", async (req, res) => {
  const services = await listServicesForTenantKey(req.owner.tenantKey);
  res.json({ services });
});

router.get("/analytics", async (req, res) => {
  const analytics = await getOwnerAnalytics(req.owner.tenantKey);
  res.json({ analytics });
});

router.get("/calendar", async (req, res) => {
  const calendar = await getCalendar(req.owner.tenantKey);
  res.json({ calendar });
});

router.put("/calendar", async (req, res) => {
  try {
    const payload = normalizeCalendarPayload(req.body || {});
    const calendar = await upsertCalendar(req.owner.tenantKey, payload);
    res.json({ calendar });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to update calendar" });
  }
});

router.get("/exports/customers", async (req, res) => {
  const csv = await generateCustomersCsv(req.owner.tenantKey);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=customers.csv");
  res.send(csv);
});

router.get("/exports/appointments", async (req, res) => {
  const csv = await generateAppointmentsCsv(req.owner.tenantKey);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=appointments.csv");
  res.send(csv);
});

router.post("/services", async (req, res) => {
  try {
    const updates = validateOwnerServiceUpdate(req.body || {});
    const updated = await updateTenant(req.owner.tenantKey, { serviceUpdate: updates });
    res.json({ services: updated?.services || [] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/services/:serviceId", async (req, res) => {
  try {
    await updateTenant(req.owner.tenantKey, { serviceDelete: req.params.serviceId });
    const services = await listServicesForTenantKey(req.owner.tenantKey);
    res.json({ services });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/pending/:customerId/approve", async (req, res) => {
  try {
    await approvePendingBooking({ tenantKey: req.owner.tenantKey, customerId: req.params.customerId });
    res.json({ status: "approved" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/appointments/manual", async (req, res) => {
  const { customerName, customerPhone, serviceId, serviceName, startISO, endISO, notes } = req.body || {};
  if (!startISO) return res.status(400).json({ error: "startISO is required" });
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: "Invalid startISO" });
  let end = endISO ? new Date(endISO) : null;
  if (end && Number.isNaN(end.getTime())) return res.status(400).json({ error: "Invalid endISO" });
  if (!end) {
    end = new Date(start);
    end.setMinutes(end.getMinutes() + 45);
  }
  const tenantKey = req.owner.tenantKey;
  const tenant = await getTenantByKey(tenantKey);
  const calendar = await getCalendar(tenantKey);
  const timezone = calendar?.timezone || tenant?.calendar?.timezone || "UTC";
  const customerId = customerPhone || uuidv4();
  const slotLabel = formatBookingDateTime(startISO, timezone);

  await upsertCustomer({
    id: customerId,
    tenantKey,
    displayName: customerName || null,
    phone: customerPhone || null
  });

  await createAppointment({
    tenantKey,
    customerId,
    serviceId: serviceId || null,
    serviceName: serviceName || null,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    slotLabel,
    notes: notes || null
  });

  if (customerPhone) {
    const resolvedService = serviceId ? getServiceById(tenant, serviceId) : null;
    const serviceLabel = serviceName || resolvedService?.name || "Service";
    const businessName = tenant?.displayName || "your salon";
    const message = `Your booking is confirmed at ${businessName} for ${serviceLabel} on ${slotLabel} (${timezone}).`;
    try {
      await sendText(tenantKey, customerPhone, message);
    } catch (err) {
      try {
        await sendSms({ to: customerPhone, body: message });
      } catch (smsErr) {
        logger.warn("booking_confirmation_failed", "owner", {
          tenantKey,
          customerPhone,
          error: smsErr.message || err.message
        });
      }
    }
  }

  res.json({
    appointment: {
      customerId,
      serviceId: serviceId || null,
      serviceName: serviceName || null,
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
      slot_label: slotLabel,
      notes: notes || null
    }
  });
});

router.post("/appointments/:appointmentId/cancel", async (req, res) => {
  const appointmentId = req.params.appointmentId;
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;
  const tenantKey = req.owner.tenantKey;
  const appointment = await getAppointmentById({ tenantKey, appointmentId });
  if (!appointment) {
    return sendError(res, { code: "APPOINTMENT_NOT_FOUND", message: "Appointment not found", status: 404 });
  }
  if (appointment.status === "cancelled") {
    return res.json({ status: "already_cancelled" });
  }
  const cancelled = await cancelAppointment({ tenantKey, appointmentId, reason });
  const tenant = await getTenantByKey(tenantKey);
  const calendar = await getCalendar(tenantKey);
  const timezone = calendar?.timezone || tenant?.calendar?.timezone || "UTC";
  const slotLabel = cancelled?.start_iso ? formatBookingDateTime(cancelled.start_iso, timezone) : "";
  if (appointment.customer_id) {
    const serviceLabel = appointment.service_name || "Service";
    const businessName = tenant?.displayName || "your salon";
    const message = `Your booking at ${businessName} for ${serviceLabel} on ${slotLabel} has been cancelled.`;
    try {
      await sendText(tenantKey, appointment.customer_id, message);
    } catch (err) {
      try {
        await sendSms({ to: appointment.customer_id, body: message });
      } catch (smsErr) {
        logger.warn("booking_cancellation_failed", "owner", {
          tenantKey,
          customerId: appointment.customer_id,
          error: smsErr.message || err.message
        });
      }
    }
  }
  return res.json({ status: "cancelled", appointment: cancelled });
});

router.post("/pending/:customerId/reject", async (req, res) => {
  try {
    await rejectPendingBooking({ tenantKey: req.owner.tenantKey, customerId: req.params.customerId });
    res.json({ status: "rejected" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/customers/:customerId", ownerAuth, async (req, res) => {
  try {
    const result = await deleteCustomerData({
      tenantKey: req.owner.tenantKey,
      customerId: req.params.customerId,
      actor: req.owner?.ownerId || "owner"
    });
    return res.json({ status: "deleted", deleted: result.deleted });
  } catch (err) {
    return sendError(res, { code: "CUSTOMER_DELETE_FAILED", message: err.message || "Failed to delete customer" });
  }
});

export default router;
