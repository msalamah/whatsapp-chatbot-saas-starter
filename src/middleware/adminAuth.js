import { logger } from "../utils/logger.js";

function getAllowedTokens() {
  return (process.env.ADMIN_API_KEYS || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function adminAuth(req, res, next) {
  const tokens = getAllowedTokens();
  if (!tokens.length) {
    logger.warn("Admin auth attempted but ADMIN_API_KEYS is not configured");
    return res.status(503).json({ error: "Admin access not configured" });
  }

  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const provided = header.slice(7).trim();
  if (!tokens.includes(provided)) {
    return res.status(403).json({ error: "Invalid bearer token" });
  }

  return next();
}
