const defaultWindowMs = 10 * 60 * 1000;

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

export function createRateLimiter({ windowMs = defaultWindowMs, max = 10, keyGenerator }) {
  const store = new Map();
  return function rateLimit(req, res, next) {
    const key = keyGenerator ? keyGenerator(req) : getRequestIp(req);
    if (!key) return next();
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          details: { retryAfter }
        }
      });
    }
    entry.count += 1;
    return next();
  };
}

export function ipRateLimiter({ windowMs = defaultWindowMs, max = 10 } = {}) {
  return createRateLimiter({ windowMs, max, keyGenerator: getRequestIp });
}
