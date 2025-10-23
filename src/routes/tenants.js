import express from "express";
import {
  listTenants,
  getTenantSummary,
  registerTenant,
  updateTenant,
  rotateTenantToken,
  deleteTenant
} from "../tenants/tenantManager.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

function parseSensitiveFlag(req) {
  const value = req.query.includeSensitive ?? req.query.include_sensitive;
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.toLowerCase());
  }
  return false;
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
    logger.error("Failed to fetch tenant", err);
    return res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      displayName,
      wabaToken,
      phoneNumberId,
      graphVersion,
      calendar,
      services
    } = req.body || {};

    const key = await registerTenant({
      displayName,
      wabaToken,
      phoneNumberId,
      graphVersion,
      calendar,
      services
    });

    const tenant = getTenantSummary(key);
    return res.status(201).json({ key, tenant });
  } catch (err) {
    logger.warn("Failed to register tenant", "tenant", { error: err.message });
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/:key", (req, res) => {
  try {
    const updated = updateTenant(req.params.key, req.body || {});
    return res.json({ tenant: getTenantSummary(updated.key) });
  } catch (err) {
    logger.warn("Failed to update tenant", "tenant", { error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:key/rotate-token", (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }
    rotateTenantToken(req.params.key, token);
    return res.json({ tenant: getTenantSummary(req.params.key) });
  } catch (err) {
    logger.warn("Failed to rotate tenant token", "tenant", { error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:key", (req, res) => {
  try {
    deleteTenant(req.params.key);
    return res.status(204).send();
  } catch (err) {
    logger.warn("Failed to delete tenant", "tenant", { error: err.message });
    if (/not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
