import jwt from "jsonwebtoken";

const SECRET = process.env.OWNER_JWT_SECRET || "change-me-owner-secret";

export function signOwnerToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function ownerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing owner token" });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, SECRET);
    req.owner = { tenantKey: decoded.tenantKey };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid owner token" });
  }
}
