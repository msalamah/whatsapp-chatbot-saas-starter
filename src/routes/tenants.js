import express from "express";
import {
  listTenants,
  getTenantSummary,
  registerTenant,
  updateTenant,
  rotateTenantToken,
  deleteTenant
} from "../tenants/tenantManager.js";
import { validateTenantCreate, validateTenantUpdate, validateTokenRotation } from "../tenants/tenantValidation.js";
import { logger } from "../utils/logger.js";

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

function logAdmin(action, data) {
  logger.info(action, "tenant-admin", data);
}

router.get("/", (req, res) => {
  const includeSensitive = parseSensitiveFlag(req);
  const tenants = listTenants({ includeSensitive });
  res.json({ tenants });
});

router.get("/:key", (req, res) => {
  try {
    const includeSensitive = parseSensitiveFlag(req);
    const tenant = getTenantSummary(req.params.key, { includeSensitive });
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    return res.json({ tenant });
  } catch (err) {
    logger.error("Failed to fetch tenant", "tenant-admin", { error: err.message });
    return res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

router.post("/", async (req, res) => {
  const actor = resolveActor(req);
  const { value, errors } = validateTenantCreate(req.body || {});
  if (errors.length) {
    logger.warn("Tenant create validation failed", "tenant-admin", { actor, errors });
    return res.status(422).json({ error: "Validation failed", details: errors });
  }
  try {
    const key = await registerTenant(value);
    const tenant = getTenantSummary(key);
    logAdmin("tenant.created", { actor, tenantKey: key, services: tenant?.services?.length || 0 });
    return res.status(201).json({ key, tenant });
  } catch (err) {
    logger.warn("Failed to register tenant", "tenant-admin", { actor, error: err.message });
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/:key", (req, res) => {
  const actor = resolveActor(req);
  const { value, errors } = validateTenantUpdate(req.body || {});
  if (errors.length) {
    logger.warn("Tenant update validation failed", "tenant-admin", { actor, tenantKey: req.params.key, errors });
    return res.status(422).json({ error: "Validation failed", details: errors });
  }
  try {
    const updated = updateTenant(req.params.key, value);
    logAdmin("tenant.updated", {
      actor,
      tenantKey: updated.key,
      fields: Object.keys(value)
    });
    return res.json({ tenant: getTenantSummary(updated.key) });
  } catch (err) {
    logger.warn("Failed to update tenant", "tenant-admin", { actor, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:key/rotate-token", (req, res) => {
  const actor = resolveActor(req);
  const { value, errors } = validateTokenRotation(req.body || {});
  if (errors.length) {
    logger.warn("Token rotation validation failed", "tenant-admin", { actor, tenantKey: req.params.key, errors });
    return res.status(422).json({ error: "Validation failed", details: errors });
  }
  try {
    rotateTenantToken(req.params.key, value.token);
    logAdmin("tenant.token_rotated", { actor, tenantKey: req.params.key });
    return res.json({ tenant: getTenantSummary(req.params.key) });
  } catch (err) {
    logger.warn("Failed to rotate tenant token", "tenant-admin", { actor, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:key", (req, res) => {
  const actor = resolveActor(req);
  try {
    deleteTenant(req.params.key);
    logAdmin("tenant.deleted", { actor, tenantKey: req.params.key });
    return res.status(204).send();
  } catch (err) {
    logger.warn("Failed to delete tenant", "tenant-admin", { actor, tenantKey: req.params.key, error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
