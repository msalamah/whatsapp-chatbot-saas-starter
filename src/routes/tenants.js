import express from "express";
import {
  listTenants,
  getTenantSummary,
  registerTenant,
  updateTenant,
  rotateTenantToken,
  rotateOwnerPortalToken,
  deleteTenant
} from "../tenants/tenantManager.js";
import { validateTenantCreate, validateTenantUpdate, validateTokenRotation } from "../tenants/tenantValidation.js";
import { logger } from "../utils/logger.js";
import { appendActivity, listActivities } from "../services/adminActivityStore.js";
import { listPendingByTenant } from "../services/pendingBookingStore.js";
import { approvePendingBooking, rejectPendingBooking } from "../services/approvalService.js";

const router = express.Router();

function parseSensitiveFlag(req) {
  const value = req.query.includeSensitive ?? req.query.include_sensitive;
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.toLowerCase());
  }
  return false;
}

function resolveActor(req) {
  const raw = req.headers["x-admin-actor"];
  if (!raw) return "admin";
  if (Array.isArray(raw)) return raw[0] || "admin";
  return String(raw).trim() || "admin";
}

function resolveRole(req) {
  const raw = req.headers["x-admin-role"];
  if (!raw) return "admin";
  if (Array.isArray(raw)) return raw[0] || "admin";
  return String(raw).trim() || "admin";
}

function recordActivity(action, { actor, role, tenantKey, details }) {
  const payload = {
    action,
    actor,
    role,
    tenantKey,
    details
  };
  logger.info(action, "tenant-admin", payload);
  appendActivity(payload);
}

router.get("/", async (req, res) => {
  const includeSensitive = parseSensitiveFlag(req);
  const tenants = await listTenants({ includeSensitive });
  res.json({ tenants });
});

router.get("/activity", async (req, res) => {
  const limit = Number.parseInt(String(req.query.limit ?? ""), 10);
  const events = await listActivities({ limit: Number.isNaN(limit) ? undefined : limit });
  res.json({ events });
});

router.get("/:key", async (req, res) => {
  try {
    const includeSensitive = parseSensitiveFlag(req);
    const tenant = await getTenantSummary(req.params.key, { includeSensitive });
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    return res.json({ tenant });
  } catch (err) {
    logger.error("Failed to fetch tenant", "tenant-admin", { error: err.message });
    return res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

router.get("/:key/pending-bookings", async (req, res) => {
  try {
    const pending = await listPendingByTenant(req.params.key);
    return res.json({ pending });
  } catch (err) {
    logger.error("Failed to list pending bookings", "tenant-admin", { error: err.message });
    return res.status(500).json({ error: "Failed to list pending bookings" });
  }
});

router.post("/:key/pending-bookings/:customerId/approve", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  try {
    const booking = await approvePendingBooking({ tenantKey: req.params.key, customerId: req.params.customerId });
    recordActivity("pending.approved", { actor, role, tenantKey: req.params.key, details: { customerId: req.params.customerId, slot: booking.slotLabel } });
    return res.json({ status: "approved" });
  } catch (err) {
    logger.warn("Failed to approve pending booking", "tenant-admin", { actor, role, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:key/pending-bookings/:customerId/reject", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  try {
    const booking = await rejectPendingBooking({ tenantKey: req.params.key, customerId: req.params.customerId });
    recordActivity("pending.rejected", { actor, role, tenantKey: req.params.key, details: { customerId: req.params.customerId, slot: booking.slotLabel } });
    return res.json({ status: "rejected" });
  } catch (err) {
    logger.warn("Failed to reject pending booking", "tenant-admin", { actor, role, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  const { value, errors } = validateTenantCreate(req.body || {});
  if (errors.length) {
    logger.warn("Tenant create validation failed", "tenant-admin", { actor, role, errors });
    return res.status(422).json({ error: "Validation failed", details: errors });
  }
  try {
    const key = await registerTenant(value);
    const tenant = await getTenantSummary(key);
    recordActivity("tenant.created", {
      actor,
      role,
      tenantKey: key,
      details: { services: tenant?.services?.length || 0 }
    });
    return res.status(201).json({ key, tenant });
  } catch (err) {
    logger.warn("Failed to register tenant", "tenant-admin", { actor, role, error: err.message });
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/:key", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  const { value, errors } = validateTenantUpdate(req.body || {});
  if (errors.length) {
    logger.warn("Tenant update validation failed", "tenant-admin", { actor, role, tenantKey: req.params.key, errors });
    return res.status(422).json({ error: "Validation failed", details: errors });
  }
  try {
    const updated = await updateTenant(req.params.key, value);
    recordActivity("tenant.updated", {
      actor,
      role,
      tenantKey: updated.key,
      details: { fields: Object.keys(value) }
    });
    return res.json({ tenant: await getTenantSummary(updated.key) });
  } catch (err) {
    logger.warn("Failed to update tenant", "tenant-admin", { actor, role, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:key/rotate-token", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  const { value, errors } = validateTokenRotation(req.body || {});
  if (errors.length) {
    logger.warn("Token rotation validation failed", "tenant-admin", { actor, role, tenantKey: req.params.key, errors });
    return res.status(422).json({ error: "Validation failed", details: errors });
  }
  try {
    await rotateTenantToken(req.params.key, value.token);
    recordActivity("tenant.token_rotated", {
      actor,
      role,
      tenantKey: req.params.key
    });
    return res.json({ tenant: await getTenantSummary(req.params.key) });
  } catch (err) {
    logger.warn("Failed to rotate tenant token", "tenant-admin", { actor, role, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:key/owner-token", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  try {
    const token = await rotateOwnerPortalToken(req.params.key);
    recordActivity("tenant.owner_token_rotated", {
      actor,
      role,
      tenantKey: req.params.key
    });
    return res.json({ ownerToken: token });
  } catch (err) {
    logger.warn("Failed to rotate owner token", "tenant-admin", { actor, role, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:key", async (req, res) => {
  const actor = resolveActor(req);
  const role = resolveRole(req);
  try {
    await deleteTenant(req.params.key);
    recordActivity("tenant.deleted", {
      actor,
      role,
      tenantKey: req.params.key
    });
    return res.status(204).send();
  } catch (err) {
    logger.warn("Failed to delete tenant", "tenant-admin", { actor, role, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
