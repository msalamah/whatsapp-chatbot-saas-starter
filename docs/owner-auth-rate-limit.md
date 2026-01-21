# Owner Auth Rate Limiting

This document describes the rate limiting applied to owner auth endpoints and how to tune it.

## Goals
- Prevent OTP abuse and brute-force attempts.
- Protect registration and verification endpoints from spam.
- Provide clear retry timing to clients.

## Where it lives
- Middleware: `src/middleware/rateLimit.js`
- Applied in: `src/routes/ownerPortal.js`

## Endpoints covered

1) `POST /owner/auth/request-otp`
- IP-based limit
- Phone-based limit

2) `POST /owner/auth/verify-otp`
- IP-based limit
- Phone-based limit

3) `POST /owner/register`
- IP-based limit
- Phone-based limit

## Response behavior
- Returns `429` with JSON `{ error: "Too many requests", retryAfter }`
- Includes `Retry-After` header (seconds)

## Default thresholds (override with env vars)

OTP request:
- `OWNER_OTP_WINDOW_MS` (default 10 minutes)
- `OWNER_OTP_IP_LIMIT` (default 5 requests / window)
- `OWNER_OTP_PHONE_LIMIT` (default 3 requests / window)

OTP verify:
- `OWNER_OTP_VERIFY_WINDOW_MS` (default 10 minutes)
- `OWNER_OTP_VERIFY_IP_LIMIT` (default 10 requests / window)
- `OWNER_OTP_VERIFY_PHONE_LIMIT` (default 5 requests / window)

Registration:
- `OWNER_REGISTER_WINDOW_MS` (default 60 minutes)
- `OWNER_REGISTER_IP_LIMIT` (default 3 requests / window)
- `OWNER_REGISTER_PHONE_LIMIT` (default 2 requests / window)

## Implementation notes

- Limits are in-memory per server instance (no shared state).
- Keying uses:
  - IP address from `x-forwarded-for` or `req.ip`
  - phone number from request body, normalized by `normalizePhone`

## Future hardening ideas
- Move counters to Redis for multi-instance deployments.
- Add exponential backoff or CAPTCHA for repeated failures.
- Log rate-limit events to a security audit stream.

## Related files
- `src/middleware/rateLimit.js`
- `src/routes/ownerPortal.js`
