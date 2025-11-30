import express from "express";
import { getTenantSummary, listServicesForTenantKey, getTenantByKey, getServiceById } from "../tenants/tenantManager.js";
import { getAvailableSlots } from "../services/availabilityService.js";
import { savePendingBooking } from "../services/pendingBookingStore.js";

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
  const windowDays = Number(req.query.windowDays || 5);
  try {
    const slots = await getAvailableSlots(tenant, { windowDays, durationMinutes });
    return res.json({ slots });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch availability" });
  }
});

router.post("/tenants/:key/book", async (req, res) => {
  const { serviceId, startISO, endISO, name, email, phone } = req.body || {};
  const tenant = await getTenantByKey(req.params.key);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  if (!serviceId || !startISO) return res.status(400).json({ error: "serviceId and startISO are required" });
  const service = getServiceById(tenant, serviceId);
  if (!service) return res.status(400).json({ error: "Invalid service" });
  const startDate = new Date(startISO);
  if (isNaN(startDate.getTime())) return res.status(400).json({ error: "Invalid startISO" });
  const durationMinutes = service.minMinutes || tenant.calendar?.slotDurationMinutes || 45;
  const end = endISO ? new Date(endISO) : new Date(startDate.getTime() + durationMinutes * 60000);
  const slotLabel = startDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tenant.calendar?.timezone || "UTC" });

  const contactId = phone || email || `web-${Date.now()}`;
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

export default router;
