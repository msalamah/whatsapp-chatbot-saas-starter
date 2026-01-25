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
Status: complete

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
Status: complete

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
Status: complete

## 12) Data privacy and retention (backend)

Goal: Prepare for client data governance requirements.

Implementation details:
- Add endpoints or admin workflows to delete customer data per tenant.
- Ensure OTP records are purged on expiry.
- Document retention policy and schedule `npm run retention:prune`.

Acceptance checks:
- Data delete action is available and logs an audit event.
- OTP table is cleaned automatically.
Status: complete

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
Status: complete

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
Status: complete

## Parity checklist (owner web vs mobile)

- [x] OTP login (request + verify)
- [x] Refresh token rotation
- [x] Registration flow
- [x] Pending approvals
- [x] Appointments list
- [x] Customers list + detail
- [x] Services CRUD
- [x] Calendar settings
- [ ] Push notification registration

## Task Force: Product gaps to close before first clients

These are the remaining gaps after core OTP + registration + owner portal parity. Each task is written so Codex can execute it directly.

### 17) Phone input UX (country code selector + formatting)

Goal: Prevent registration/login failures caused by missing country codes or invalid formatting.

Implementation details:
- Mobile (`apps/owner-mobile`):
  - Replace the raw `TextInput` for phone with a phone input component that supports country selection and E.164 output.
  - Persist the last selected country to reduce friction on next login.
  - Display validation errors inline (below the input).
  - Ensure all OTP/register requests send the E.164 value.
- Backend:
  - Keep validation strict, but return error codes that map to user-friendly hints ("Include country code", "Invalid phone format").

Web counterpart:
- Update `apps/owner/src/components/OwnerAuthForm.tsx` to use the same phone input behavior and validation hints.

Acceptance checks:
- User can pick a country and input a phone without manually typing `+`.
- Submitting with a local number produces an actionable error and does not send a request.
Status: complete

## Phase 1 Production Readiness (owner-created bookings)

This section is specific to the first production phase: owners manually add bookings and customers receive confirmations.

### P1-1) Customer booking confirmation message (backend + templates)

Goal: When an owner creates a manual booking, the customer receives a confirmation message without requiring any user input.

Implementation details:
- Backend:
  - Extend `POST /owner/appointments/manual` to trigger a confirmation notification after appointment creation.
  - Use WhatsApp if the tenant has WABA credentials and the customer phone is valid; fall back to SMS if WhatsApp is not configured.
  - Add a message template that includes: business name, service name, date/time, timezone, and contact info.
  - Log message send result (success/failure) for troubleshooting.
- Configuration:
  - Require WhatsApp credentials (WABA token + phone number ID) or SMS credentials (Twilio) for production.

Web counterpart:
- No UI changes required, but add a note in the booking modal that a confirmation will be sent.

Acceptance checks:
- Creating a manual booking sends a WhatsApp or SMS confirmation to the customer.
- Failures are logged without breaking booking creation.
Status: complete

### P1-2) Owner-initiated cancellation with customer notification

Goal: Allow owners to cancel a booking and notify the customer automatically.

Implementation details:
- Backend:
  - Add `POST /owner/appointments/:id/cancel` (JWT required).
  - Mark the appointment as cancelled (status + timestamps) without deleting it.
  - Send a cancellation message to the customer (WhatsApp preferred, SMS fallback).
  - Ensure calendar views exclude cancelled appointments or mark them clearly.
- Mobile:
  - Add a cancel action in appointment detail (or a long-press action in calendar).
  - Confirm cancellation with a modal before sending.
- Web:
  - Add a cancel action in the appointments list and/or calendar event detail.
  - Confirm cancellation with a modal before sending.

Acceptance checks:
- Cancelling a booking removes it from upcoming lists and notifies the customer.
Status: complete

### P1-3) Confirmation + cancellation content and localization

Goal: Ensure messages are clear and formatted using tenant timezone.

Implementation details:
- Backend:
  - Format date/time using tenant timezone.
  - Support basic language selection (default to tenant language or fallback to English).
  - Ensure message content fits SMS/WhatsApp limits.

Acceptance checks:
- Confirmation/cancellation content is readable and correctly formatted.
Status: complete

### P1-4) Owner blackout ranges (date + time)

Goal: Allow owners to block full days, date ranges, or specific hours so no bookings can be created.

Implementation details:
- Backend:
  - Extend calendar blocks to support full-day, multi-day, and partial-day ranges (store start/end ISO boundaries).
  - Ensure availability calculation excludes blocked ranges.
- Mobile:
  - Add a “Block dates/times” action that lets owners pick a start and end datetime.
  - Save as calendar blocks in Settings.
- Web:
  - Add a “Block dates/times” action in calendar settings with datetime range inputs.

Acceptance checks:
- Blocked date ranges remove availability and prevent booking creation.
Status: pending
### 18) Date/time pickers for booking + calendar blocks

Goal: Remove raw ISO inputs for bookings and block times to reduce errors.

Implementation details:
- Mobile:
  - Replace ISO `TextInput`s in the booking modal with date/time pickers.
  - Replace ISO `TextInput`s in calendar blocks (Settings screen) with date/time pickers.
  - Convert picker selections into ISO strings before submitting to backend.
  - Add guardrails (end time must be after start time).
- Backend:
  - Keep existing ISO parsing; return clear error codes for invalid time ranges.

Web counterpart:
- Add booking creation UI (see Task 20) with date/time pickers.
- Update calendar blocks in `apps/owner/src/components/CalendarSettings.tsx` to use date/time pickers.

Acceptance checks:
- No manual ISO entry needed in UI.
- Invalid ranges are blocked client-side and reported clearly.
Status: complete

### 19) Owner profile management (edit business + owner info)

Goal: Allow owners to update business and contact info without admin intervention.

Implementation details:
- Backend:
  - Add `GET /owner/profile` and `PUT /owner/profile` (JWT required).
  - Fields: business name, owner name, email, phone (optional), timezone.
  - Validate phone changes (E.164) and require OTP re-verify on phone change.
- Mobile:
  - Add a profile screen under Settings with editable fields.
  - Handle phone-change OTP verification flow.
  - Cache latest profile in state and refresh on app resume.

Web counterpart:
- Add a profile section in `apps/owner/src/App.tsx` and implement the same edit + phone-change OTP flow.

Acceptance checks:
- Owner can update business name/email/timezone and see changes reflected after refresh.
- Phone change requires OTP verification.
Status: complete

### 20) Web manual booking creation

Goal: Achieve parity with the mobile “Add booking” flow.

Implementation details:
- Web:
  - Add an “Add booking” CTA and modal in `apps/owner/src/App.tsx`.
  - Fields: customer name, phone, service selection, start/end time, notes.
  - Add availability helper (optional) or use same endpoint as mobile if implemented.
  - Use `/owner/appointments/manual` to create bookings.

Web counterpart:
- This is the web parity task for mobile’s existing booking modal.

Acceptance checks:
- Owner can create a manual booking from the web and it appears in appointments list and calendar.
Status: complete

### 21) Web push registration (parity with mobile)

Goal: Enable web push notifications to match mobile’s device registration.

Implementation details:
- Backend:
  - Extend `/owner/devices` to accept web push subscriptions (endpoint + keys).
  - Store subscription payload and platform type.
  - Add helper to send a test push (dev-only).
- Web:
  - Add Service Worker file to `apps/owner/public/`.
  - Generate VAPID keys and expose the public key to the web app.
  - Request notification permission, create a subscription, and POST to `/owner/devices`.

Web counterpart:
- This is the web parity task for mobile push token registration.

Acceptance checks:
- Web app can register a push subscription and store it server-side.
- Test push reaches the browser when permission is granted.
Status: complete

### 22) UX polish and offline guidance

Goal: Make the app resilient and client-ready.

Implementation details:
- Mobile:
  - Add consistent empty states and error banners across all screens.
  - Add offline banner and retry actions for API failures.
  - Replace "Go" and generic button labels with clearer actions.
- Web:
  - Align empty states and error messaging with mobile.
  - Add a persistent top-level error banner for auth/network failures.

Acceptance checks:
- Every list has a meaningful empty state.
- Offline or failed requests show a consistent and actionable message.
Status: complete
