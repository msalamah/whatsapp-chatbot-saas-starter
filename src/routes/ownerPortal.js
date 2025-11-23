import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getTenantByKey } from "../tenants/tenantManager.js";
import { listPendingByTenant } from "../services/pendingBookingStore.js";
import { approvePendingBooking, rejectPendingBooking } from "../services/approvalService.js";
import { listAppointmentsForTenant } from "../services/appointmentStore.js";
import { listCustomersForTenant } from "../services/customerStore.js";
import { listServicesForTenantKey } from "../tenants/tenantManager.js";
import { ownerAuth, signOwnerToken } from "../middleware/ownerAuth.js";

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
  const appointments = await listAppointmentsForTenant(req.owner.tenantKey, { limit: 50 });
  res.json({ appointments });
});

router.get("/customers", async (req, res) => {
  const customers = await listCustomersForTenant(req.owner.tenantKey, { limit: 100 });
  res.json({ customers });
});

router.get("/services", async (req, res) => {
  const services = await listServicesForTenantKey(req.owner.tenantKey);
  res.json({ services });
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
