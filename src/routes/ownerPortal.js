import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getTenantByKey } from "../tenants/tenantManager.js";
import { listPendingByTenant } from "../services/pendingBookingStore.js";
import { approvePendingBooking, rejectPendingBooking } from "../services/approvalService.js";
import { listAppointmentsForTenant, listAppointmentsForCustomer } from "../services/appointmentStore.js";
import { listCustomersForTenant, getCustomerDetail } from "../services/customerStore.js";
import { listServicesForTenantKey, updateTenant } from "../tenants/tenantManager.js";
import { validateOwnerServiceUpdate } from "../tenants/tenantValidation.js";
import { ownerAuth, signOwnerToken } from "../middleware/ownerAuth.js";
import { generateCustomersCsv, generateAppointmentsCsv } from "../services/csvExport.js";
import { getOwnerAnalytics } from "../services/analyticsService.js";

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ownerHtmlPath = path.resolve(__dirname, "../../public/owner/index.html");

function buildCalendarLink(tenant) {
  if (!tenant?.calendar?.calendarId) return null;
  const encoded = encodeURIComponent(tenant.calendar.calendarId);
  return `https://calendar.google.com/calendar/u/0/r?cid=${encoded}`;
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
  const { limit = 100, q = "" } = req.query;
  const customers = await listCustomersForTenant(req.owner.tenantKey, { limit: Number(limit) || 100, search: String(q) });
  res.json({ customers });
});

router.get("/customers/:customerId", async (req, res) => {
  const customer = await getCustomerDetail(req.owner.tenantKey, req.params.customerId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  const appointments = await listAppointmentsForCustomer(req.owner.tenantKey, req.params.customerId, { limit: 20 });
  res.json({ customer, appointments });
});

router.get("/services", async (req, res) => {
  const services = await listServicesForTenantKey(req.owner.tenantKey);
  res.json({ services });
});

router.get("/analytics", async (req, res) => {
  const analytics = await getOwnerAnalytics(req.owner.tenantKey);
  res.json({ analytics });
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

router.post("/pending/:customerId/reject", async (req, res) => {
  try {
    await rejectPendingBooking({ tenantKey: req.owner.tenantKey, customerId: req.params.customerId });
    res.json({ status: "rejected" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
