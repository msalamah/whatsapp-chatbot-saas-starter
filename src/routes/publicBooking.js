import express from "express";
import { getTenantSummary, listServicesForTenantKey, getTenantByKey, getServiceById } from "../tenants/tenantManager.js";
import { getAvailableSlots } from "../services/availabilityService.js";
import { savePendingBooking } from "../services/pendingBookingStore.js";
import { createOtp, validateOtpToken, verifyOtp } from "../services/otpStore.js";
import { logger } from "../utils/logger.js";
import { sendOtpSms, sendOtpEmail } from "../services/notificationService.js";

const router = express.Router();

router.get("/tenants/:key", async (req, res) => {
  const tenant = await getTenantSummary(req.params.key, { includeSensitive: false });
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  // Strip previews too for public response
  return res.json({ tenant: { ...tenant, wabaTokenPreview: undefined, ownerTokenPreview: undefined } });
});

router.get("/tenants/:key/services", async (req, res) => {
  const services = await listServicesForTenantKey(req.params.key);
  if (!services) return res.status(404).json({ error: "Tenant not found" });
  return res.json({ services });
});

router.get("/tenants/:key/availability", async (req, res) => {
  const tenant = await getTenantByKey(req.params.key);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  const serviceId = req.query.serviceId || null;
  const service = serviceId ? getServiceById(tenant, serviceId) : null;
  const durationMinutes = service?.minMinutes || tenant.calendar?.slotDurationMinutes || 45;
  const windowDays = req.query.windowDays ? Number(req.query.windowDays) : undefined;
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  try {
    const slots = await getAvailableSlots(tenant, {
      windowDays,
      durationMinutes,
      from,
      to
    });
    return res.json({ slots });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch availability" });
  }
});

router.post("/tenants/:key/book", async (req, res) => {
  const { serviceId, startISO, endISO, name, email, phone, otpToken } = req.body || {};
  const tenant = await getTenantByKey(req.params.key);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  const contact = phone || email;
  if (!serviceId || !startISO || !contact) return res.status(400).json({ error: "serviceId, startISO, and contact are required" });
  const service = getServiceById(tenant, serviceId);
  if (!service) return res.status(400).json({ error: "Invalid service" });
  const startDate = new Date(startISO);
  if (isNaN(startDate.getTime())) return res.status(400).json({ error: "Invalid startISO" });
  const durationMinutes = service.minMinutes || tenant.calendar?.slotDurationMinutes || 45;
  const end = endISO ? new Date(endISO) : new Date(startDate.getTime() + durationMinutes * 60000);
  const slotLabel = startDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tenant.calendar?.timezone || "UTC" });

  const contactId = contact;

  const otpOk = await validateOtpToken({ tenantKey: tenant.key, contact: contactId, token: otpToken });
  if (!otpOk) return res.status(401).json({ error: "OTP verification required" });
  await savePendingBooking(contactId, {
    tenantKey: tenant.key,
    eventId: null,
    startISO: startDate.toISOString(),
    endISO: end.toISOString(),
    slotLabel,
    timeZone: tenant.calendar?.timezone || "UTC",
    serviceId: service.id,
    serviceName: service.name,
    servicePrice: service.price || null,
    serviceCurrency: service.currency || "USD",
    serviceDescription: service.description || "",
    durationMinutes,
    source: "web",
    customerName: name || null,
    customerEmail: email || null
  });

  return res.status(201).json({ status: "pending", slotLabel, service: { id: service.id, name: service.name } });
});

router.post("/auth/request-otp", async (req, res) => {
  const { tenantKey, contact, channel = "phone" } = req.body || {};
  if (!tenantKey || !contact) return res.status(400).json({ error: "tenantKey and contact are required" });
  const tenant = await getTenantByKey(tenantKey);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await createOtp({ tenantKey, contact, code, channel });
  try {
    if (channel === "email") {
      await sendOtpEmail({ to: contact, code });
    } else {
      await sendOtpSms({ to: contact, code });
    }
  } catch (err) {
    logger.error("Failed to dispatch OTP", "otp", { channel, contact, error: err.message });
  }
  return res.json({ status: "sent" });
});

router.post("/auth/verify-otp", async (req, res) => {
  const { tenantKey, contact, code } = req.body || {};
  if (!tenantKey || !contact || !code) return res.status(400).json({ error: "tenantKey, contact, and code are required" });
  try {
    const token = await verifyOtp({ tenantKey, contact, code });
    return res.json({ token });
  } catch (err) {
    return res.status(400).json({ error: err.message || "OTP verification failed" });
  }
});

export default router;
