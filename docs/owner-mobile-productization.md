# Owner Mobile Productization Tasks

This document breaks down the work required to productize the owner mobile app and the backend it depends on. Each task includes implementation details and acceptance checks so it can be executed directly.

## 1) Mobile-first owner registration flow (app)

Goal: Allow a new owner to register directly in the mobile app without admin console access.

Implementation details:
- Add a "Create account" CTA to the login screen in `apps/owner-mobile/App.tsx` and route to a registration screen.
- Registration form fields (minimum):
  - Business name (displayName)
  - Owner name
  - Phone number (E.164)
  - Email (optional)
  - Timezone (select or autodetect, default to device tz)
  - Services seed (simple list with name + duration + price) or "skip for now"
- UX requirements:
  - Validate phone formatting client-side; show clear errors.
  - Persist partial form state locally in case the app is backgrounded.
  - On success, navigate to OTP verification (see task 2), then land in logged-in state.
- Backend dependency:
  - Create `POST /owner/register` (see task 7) that creates a tenant + owner account.

Web counterpart:
- Add the same registration entry point and form flow in `apps/owner` with identical fields, validation, and success/OTP handoff.

Acceptance checks:
- A first-time user can register from the app with no admin tooling.
- Registration returns an OTP challenge that leads to successful login.
- The resulting tenant has a calendar default + services seeded when provided.
Status: complete

## 2) OTP-based owner login (app)

Goal: Replace static owner token login with OTP sent to phone.

Implementation details:
- Update `apps/owner-mobile/App.tsx` to use OTP flow:
  - Screen 1: enter phone number + tenant key (optional for first-time login; if unknown, allow lookup by phone).
  - Screen 2: enter OTP code.
- Add rate limit UI handling (cooldown timer, disable re-send button).
- Persist the phone number in SecureStore for next login.
- Remove owner token fields from UI once OTP flow is live.

Web counterpart:
- Replace owner token login in `apps/owner` with the same OTP request/verify flow and cooldown UX.

Acceptance checks:
- User can request OTP, verify it, and receive a JWT session.
- Re-send OTP is blocked during cooldown and shows a clear message.
- Invalid OTP shows a friendly error and allows retry.
Status: complete

## 3) OTP-based owner login (backend)

Goal: Add secure OTP issuance and verification for owner login.

Implementation details:
- Introduce `POST /owner/auth/request-otp`:
  - Input: `phone`, optional `tenantKey`.
  - Validate the phone format.
  - Lookup tenant(s) by phone ownership (see task 6).
  - Create OTP record with TTL (e.g. 5 minutes), attempt limits, and hashed code storage.
  - Dispatch OTP via SMS provider (Twilio or configured provider).
- Introduce `POST /owner/auth/verify-otp`:
  - Input: `phone`, `code`, optional `tenantKey`.
  - Verify OTP, lock out after too many attempts.
  - If multiple tenants match the phone, require `tenantKey` or return a list to pick from.
  - On success, return owner JWT.
- Store OTP records in a persistent store with expiry cleanup.

Acceptance checks:
- OTP expires after TTL and cannot be reused.
- Wrong code increments attempts and eventually locks out for a cooldown window.
- Successful verification returns a valid JWT tied to the correct tenant.
Status: complete

## 4) Owner registration (backend)

Goal: Create a tenant + owner profile from mobile app registration.

Implementation details:
- Add `POST /owner/register`:
  - Input: `displayName`, `ownerName`, `phone`, optional `email`, `timezone`, `services[]`.
  - Validate and normalize fields.
  - Create tenant record with calendar defaults (timezone).
  - Seed services if provided.
  - Create or upsert owner identity linked to tenant and phone.
  - Trigger OTP challenge (same response shape as request-otp).
- If phone already belongs to an existing tenant, return conflict and guide the user to login instead.

Acceptance checks:
- Successful registration creates tenant + owner identity and returns OTP challenge.
- Duplicate phone rejects with 409 and a friendly error.
Status: complete

## 5) Owner identity model + tenant mapping (backend)

Goal: Introduce a real owner identity that can have multiple tenants and supports OTP login.

Implementation details:
- Add new table `owners`:
  - `id`, `phone`, `email`, `display_name`, `created_at`, `updated_at`
- Add mapping table `owner_tenants`:
  - `owner_id`, `tenant_key`, `role` (owner/staff), `created_at`
- Update login to resolve `phone` to one or more tenant associations.
- Maintain backward compatibility for existing owner token logins during transition (feature flag).

Acceptance checks:
- A single phone can be linked to multiple tenants.
- Owner JWT includes `ownerId`, `tenantKey`, and `role`.
Status: complete

## 6) Tenant lookup by phone (backend)

Goal: Allow OTP login when user does not know tenant key.

Implementation details:
- Add query `GET /owner/tenants?phone=...`:
  - Requires OTP verification or a short-lived pre-auth token from request-otp.
  - Returns list of tenant names/keys associated with phone.
- When a phone is linked to multiple tenants, mobile app shows a tenant picker.

Acceptance checks:
- Tenant list is only available after OTP request or verification.
- Tenant picker flows into OTP verification with the selected tenant.
Status: complete

## 7) Mobile session management and refresh (app + backend)

Goal: Prevent hard logouts and improve session continuity.

Implementation details:
- Add `POST /owner/auth/refresh`:
  - Accepts refresh token, returns new JWT and refresh token (rotation).
- Store refresh token in SecureStore.
- Implement silent refresh in `apps/owner-mobile/App.tsx` on app resume or 401 responses.

Web counterpart:
- Implement refresh token storage and silent refresh in `apps/owner` with the same 401 recovery logic.

Acceptance checks:
- Expired JWT triggers refresh without user interaction.
- Refresh rotation prevents replay of old refresh tokens.
Status: complete

## 8) Rate limiting and abuse protection (backend)

Goal: Protect OTP and login endpoints from abuse.

Implementation details:
- Apply IP and phone-based throttling for:
  - `/owner/auth/request-otp`
  - `/owner/auth/verify-otp`
  - `/owner/register`
- Return consistent error payloads with retry-after hints.

Acceptance checks:
- Excessive requests are blocked and return a clear message.
- Cooldown is respected per phone + IP.
Status: complete

## 9) Secure secrets and config for production (backend)

Goal: Remove insecure defaults and document required env vars.

Implementation details:
- Fail server startup if `OWNER_JWT_SECRET` is missing.
- Require SMS provider credentials for OTP.
- Document env requirements in `README.md` and add a template section.

Acceptance checks:
- Server fails fast without required secrets.
- `README.md` lists all required env vars for owner mobile.

## 10) Mobile UX polish for OTP and registration (app)

Goal: Ensure a polished, client-ready flow.

Implementation details:
- Add phone input masking + country selector (or a minimal E.164 helper).
- Add a branded success screen after registration.
- Add loading states, error banners, and offline handling.
- Add analytics hooks for login/register funnel (optional but recommended).

Web counterpart:
- Align web login/registration UX to match mobile (masking, error banners, success screen, loading states).

Acceptance checks:
- No dead-ends in onboarding.
- Errors are actionable and do not block navigation.

## 11) Push notification registration (app + backend)

Goal: Enable approvals and booking updates via push.

Implementation details:
- Add device token registration endpoint `POST /owner/devices` with JWT auth.
- Store device tokens per owner + tenant + platform.
- Add helper to send push on pending booking updates (future).
- Implement Expo push token capture in the app and register on login.

Web counterpart:
- Add web push subscription registration using Service Worker and register to `/owner/devices` (optional if web push is in scope).

Acceptance checks:
- Device token stored and updated on app launch.
- Duplicate token entries are deduped.

## 12) Data privacy and retention (backend)

Goal: Prepare for client data governance requirements.

Implementation details:
- Add endpoints or admin workflows to delete customer data per tenant.
- Ensure OTP records are purged on expiry.
- Document retention policy and schedule `npm run retention:prune`.

Acceptance checks:
- Data delete action is available and logs an audit event.
- OTP table is cleaned automatically.

## 13) App modularization and maintainability (app)

Goal: Make the mobile app maintainable for future features.

Implementation details:
- Split `apps/owner-mobile/App.tsx` into:
  - `screens/` for each view
  - `services/api.ts` for network calls
  - `state/` for session + data logic
  - `components/` for reusable UI
- Add basic navigation types to prevent route mistakes.

Web counterpart:
- Refactor `apps/owner` into shared `components/`, `services/`, and `pages/` with a dedicated API client mirroring mobile error handling.

Acceptance checks:
- No large monolithic component.
- API layer handles auth headers and error normalization.

## 14) Backend error shape + mobile handling (backend + app)

Goal: Standardize API errors for predictable UX.

Implementation details:
- Return `{ error: { code, message, details? } }` across `/owner` endpoints.
- Update mobile error handling to map error codes to user-friendly messages.

Web counterpart:
- Update `apps/owner` error handling to map the same error codes to consistent, user-friendly banners.

Acceptance checks:
- At least OTP and registration errors use standardized codes.
Status: complete

## 15) Owner web app alignment (apps/owner)

Goal: Align owner web portal with the mobile app for onboarding, auth, and core workflows.

Implementation details:
- Mirror OTP-based login and registration flow in `apps/owner`:
  - Replace owner token login with OTP request/verify.
  - Add "Create account" registration screen with same fields as mobile.
  - Support tenant picker if multiple tenants match the phone.
- Align session handling with mobile:
  - Use refresh token flow and silent refresh on 401.
  - Store session in secure browser storage with clear logout handling.
- Align feature parity and UI behavior:
  - Pending approvals, appointments, customers, services, calendar should use the same API responses and error codes.
  - Implement consistent empty states and error banners across web and mobile.
  - Add server-driven feature flags (for staged rollout of OTP/registration).
- Align settings and profile:
  - Owner profile screen with business name, phone, email, timezone.
  - Add ability to rotate owner token only if legacy token login is still enabled.

Acceptance checks:
- Web and mobile can both register and login using OTP.
- Session refresh works on both clients without manual re-login.
- Feature parity: actions in web match those in mobile for approvals, appointments, customers, services, calendar.
Status: complete

## 16) Web-to-mobile consistency testing

Goal: Prevent drift between the owner web and mobile apps.

Implementation details:
- Add shared API contract tests (e.g., schema validation) for `/owner/*` responses.
- Add end-to-end happy-path tests for web login + approvals.
- Create a parity checklist in `docs/owner-mobile-productization.md` and keep it updated.

Acceptance checks:
- Contract tests run in CI and fail on response shape changes.
- Parity checklist is updated when features land.
