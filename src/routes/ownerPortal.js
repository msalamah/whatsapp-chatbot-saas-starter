import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getTenantByKey } from "../tenants/tenantManager.js";
import { listPendingByTenant } from "../services/pendingBookingStore.js";
import { approvePendingBooking, rejectPendingBooking } from "../services/approvalService.js";
import { listAppointmentsForTenant, listAppointmentsForCustomer, createAppointment } from "../services/appointmentStore.js";
import { listCustomersForTenant, getCustomerDetail } from "../services/customerStore.js";
import { listServicesForTenantKey, updateTenant } from "../tenants/tenantManager.js";
import { validateOwnerServiceUpdate } from "../tenants/tenantValidation.js";
import { ownerAuth, signOwnerToken } from "../middleware/ownerAuth.js";
import { generateCustomersCsv, generateAppointmentsCsv } from "../services/csvExport.js";
import { getOwnerAnalytics } from "../services/analyticsService.js";
import { getCalendar, upsertCalendar } from "../services/calendarService.js";
import { upsertCustomer } from "../services/customerStore.js";
import { listTenantsForPhone, getOwnerTenantLink } from "../services/ownerStore.js";
import { createOwnerOtp, validateOwnerPreauth, verifyOwnerOtp } from "../services/ownerOtpStore.js";
import { sendOtpSms } from "../services/notificationService.js";
import { v4 as uuidv4 } from "uuid";

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

router.post("/auth/request-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const tenantKey = req.body?.tenantKey ? String(req.body.tenantKey).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: "Valid phone is required" });
  }
  const tenants = await listTenantsForPhone(phone);
  if (!tenants.length) {
    return res.status(404).json({ error: "Owner not found for phone" });
  }
  let resolvedTenantKey = tenantKey;
  if (tenantKey) {
    const link = await getOwnerTenantLink({ phone, tenantKey });
    if (!link) {
      return res.status(404).json({ error: "Owner not linked to tenant" });
    }
  } else if (tenants.length === 1) {
    resolvedTenantKey = tenants[0].key;
  } else {
    return res.status(409).json({ error: "Tenant selection required", tenants });
  }
  const otp = await createOwnerOtp({ phone, tenantKey: resolvedTenantKey });
  try {
    await sendOtpSms({ to: phone, code: otp.code });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send OTP" });
  }
  return res.json({
    status: "sent",
    tenantKey: resolvedTenantKey,
    expiresAt: otp.expiresAt,
    preauthToken: otp.preauthToken
  });
});

router.post("/auth/verify-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const tenantKey = req.body?.tenantKey ? String(req.body.tenantKey).trim() : "";
  const code = req.body?.code ? String(req.body.code).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: "Valid phone is required" });
  }
  if (!tenantKey) {
    return res.status(400).json({ error: "tenantKey is required" });
  }
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  try {
    await verifyOwnerOtp({ phone, tenantKey, code });
  } catch (err) {
    return res.status(400).json({ error: err.message || "OTP verification failed" });
  }
  const link = await getOwnerTenantLink({ phone, tenantKey });
  if (!link) {
    return res.status(404).json({ error: "Owner not linked to tenant" });
  }
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }
  const jwt = signOwnerToken({ tenantKey, ownerId: link.owner_id, role: link.role || "owner" });
  return res.json({
    token: jwt,
    tenant: {
      key: tenant.key,
      name: tenant.displayName,
      calendarLink: buildCalendarLink(tenant)
    }
  });
});

router.get("/tenants", async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const token = req.query.token ? String(req.query.token).trim() : "";
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: "Valid phone is required" });
  }
  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }
  const ok = await validateOwnerPreauth({ phone, token });
  if (!ok) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const tenants = await listTenantsForPhone(phone);
  return res.json({ tenants });
});

router.get("/portal", (_req, res) => {
  res.sendFile(ownerHtmlPath);
});

router.use(ownerAuth);

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
  const customerId = customerPhone || uuidv4();
  const slotLabel = new Date(startISO).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: req.owner?.calendar?.timezone || "UTC"
  });

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

router.post("/pending/:customerId/reject", async (req, res) => {
  try {
    await rejectPendingBooking({ tenantKey: req.owner.tenantKey, customerId: req.params.customerId });
    res.json({ status: "rejected" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
