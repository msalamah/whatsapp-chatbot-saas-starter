# WhatsApp Chatbot SaaS – System Overview

This document summarizes the codebase architecture, subsystems, go-to-market vision, and roadmap so new contributors can ramp quickly and understand what remains before onboarding the first production tenant.

## Vision & Go-To-Market

1. **Phase 1 – Arabic salons in Israel**: deliver a best-in-class WhatsApp booking assistant, owner portal, and admin tooling so salons can manage appointments locally. Success is measured by onboarding our first tenants in Arab villages/towns, minimizing manual work for salon owners, and proving reliability.
2. **Phase 2 – Owner mobile companion**: release a native (or React Native) app so owners can approve bookings, manage calendars, and receive push notifications without using the web portal.
3. **Phase 3 – Marketplace & commerce**: once tenant density is achieved, open a consumer-facing mobile experience where end-users can discover salons, book services, buy products, view social content, and engage with campaigns. Introduce revenue channels such as subscriptions, transaction fees, advertising, and promotions across the platform.

### Current status (December 2025)
- Backend, admin, owner, and booking web apps are implemented.
- Internal calendar and availability engine replaces Google Calendar.
- WhatsApp chatbot agent handles booking, status, cancellation, Q&A flows.
- Documentation, security/compliance checklists, and deployment guides exist.
- Pending initiatives: secret management hardening, production deployment automation, owner mobile app, and marketplace functionality.

## High-level architecture

```mermaid
flowchart LR
  subgraph Frontends
    Admin[Admin portal<br/>apps/admin]
    Owner[Owner portal<br/>apps/owner]
    Booking[Customer booking web app<br/>apps/booking]
  end
  subgraph Backend
    API[(Express server<br/>src/app.js)]
    Conv[conversationService<br/>+ OpenAI]
    Availability[availabilityService<br/>+ calendarService]
    Stores[(Postgres<br/>tenants/customers/pending)]
  end
  Admin -->|Bearer token| API
  Owner -->|Owner token/JWT| API
  Booking -->|Public REST| API
  API --> Conv
  API --> Availability
  API --> Stores
  WA[(WhatsApp Cloud API)] -->|webhooks| API
  API --> WA
```

| Layer | Description |
|-------|-------------|
| **Express backend (`src/`)** | Multi-tenant webhook + REST APIs. Handles WhatsApp events, LLM orchestration, tenant CRUD, owner APIs, analytics, CSV exports, booking flows, and persistence. |
| **Admin portal (`apps/admin/`)** | React/Vite app for internal operators. Uses API key auth to create/update tenants, rotate WABA tokens, edit calendars/services, and review audit logs. |
| **Owner portal (`apps/owner/`)** | React/Vite app for tenant owners. Authenticated by owner token → JWT. Provides pending approvals, analytics, customer/service management, CSV export, and internal calendar editing. |
| **Booking app (`apps/booking/`)** | Public-facing site tenants can share with customers. Supports service selection, timeslot browsing, OTP verification, and booking submission. |
| **Database** | Postgres (or `pg-mem` in tests) storing tenants, services, calendars, customers, appointments, pending bookings, audit history. Seed data lives under `src/tenants/`. |
| **External integrations** | WhatsApp Business Cloud API (webhooks + outbound messages), OpenAI Responses API for intent classification, optional Google Calendar (still supported for legacy flow). |

## Backend modules (`src/`)

- `server.js` launches Express on `PORT` (default 3000).
- `app.js` wires middleware (CORS, JSON parsing, env validation), initializes Postgres, and mounts routers:
  - `/webhook` (WhatsApp verification + inbound message handling).
  - `/tenants` (admin APIs) protected by `adminAuth` bearer token middleware.
  - `/owner` (owner portal login + data APIs) protected by JWTs from `ownerAuth`.
- **Services and utilities**
  - `services/bookingService.js` orchestrates WhatsApp interactions, slot presentation, pending booking lifecycle.
  - `services/availabilityService.js` calculates slots from tenant calendars.
  - `services/approvalService.js` sends confirmations/cancellations and writes appointments.
  - `services/customerStore.js`, `appointmentStore.js`, `pendingBookingStore.js`, `analyticsService.js`, `csvExport.js` handle persistence & reporting.
- `services/dataRetentionService.js` + `scripts/prune-data.js` implement configurable cleanup for privacy/compliance.
- `services/conversationService.js` manages OpenAI prompts with rule-based fallback.
- `services/whatsappService.js` wraps outbound Graph API calls per tenant.
- `tenants/tenantManager.js` normalizes tenant/service data, rotations, and seeding.
- `middleware/adminAuth.js` + `ownerAuth.js` enforce authentication.
- `utils/verifySignature.js` validates webhook signatures, `utils/logger.js` emits structured logs.

### How components interact
1. **WhatsApp agent**
   - Meta posts inbound messages to `/webhook`.
   - `bookingService.handleIncomingChange` resolves the tenant by `phone_number_id`, loads pending bookings, and calls `conversationService` to obtain structured intents.
   - Depending on the action (`SHOW_AVAILABILITY`, `PENDING_STATUS`, `CANCEL_BOOKING`, `ANSWER`, `ESCALATE`, `UNKNOWN`) the service invokes `availabilityService`, `pendingBookingStore`, and `whatsappService` to send text/buttons.
   - Slot selections create tentative events via `calendarService` and await owner approval.
2. **Owner workflow**
   - Owners log in via `/owner/login` with tenant key + owner token. API issues JWT.
   - SPA calls `/owner/*` endpoints to fetch analytics, pending requests, services, customers, and internal calendar configuration.
   - Approvals write through `appointmentStore` and clear pending entries.
3. **Admin workflow**
   - Admin portal authenticates with `Authorization: Bearer <ADMIN_API_KEY>` and optional actor header.
   - CRUD endpoints at `/tenants` manage tenant metadata, services, calendars, WABA tokens, and audit logs.
4. **Booking app**
   - Public REST under `/public` exposes tenant summary (`/public/tenants/:key`), services, availability, OTP, and booking submission.
   - The Vite app consumes these endpoints and feeds successful bookings into the same pending approval flow used by WhatsApp.

## Frontend apps

### Admin portal (`apps/admin/`)
- Vite + React with TypeScript.
- To run locally:
  ```bash
  cd apps/admin
  npm install   # first run
  npm run dev
  ```
- Connect via `Authorization: Bearer <ADMIN_API_KEY>` (value from `.env`). Features include tenant roster, audits, service management, token rotations, pending booking actions.

### Owner portal (`apps/owner/`)
- Vite + React + TypeScript single page app served at `/owner/portal`.
- Local development:
  ```bash
  cd apps/owner
  npm install   # first run
  npm run dev
  ```
- End users log in with tenant key + owner token. Once authenticated, the app calls `/owner/*` APIs to display pending bookings, analytics cards, appointments, customers with detail panels, service CRUD, and CSV exports.

### Booking web app (`apps/booking/`)
- Public React/Vite app that consumes `/public` APIs.
- Flow:
  1. Tenant key passed via querystring (`?tenant=<key>`).
  2. Fetch tenant summary + services.
  3. User chooses a service; UI shows price/duration and allows selecting a date range.
  4. Calls `/public/tenants/:key/availability` to list slots.
  5. OTP verification (`requestOtp`, `verifyOtp`) ensures contact ownership.
  6. Booking submission hits `/public/tenants/:key/bookings`, inserting a pending record identical to WhatsApp’s flow.
- After submission the owner sees the request in the owner portal; customer receives confirmation via WhatsApp once approved.

### Owner mobile app (`apps/owner-mobile/`)
- Expo (React Native) companion that reuses the `/owner/*` APIs.
- Features in the initial version:
  - Secure login with tenant key + owner token. JWT is stored using `expo-secure-store`.
  - Dashboard card with analytics (total bookings, last 30 days, upcoming, projected revenue).
  - Pending approvals list with approve/reject controls and pull-to-refresh.
  - Logout handling that clears cached credentials.
- Run locally:
  ```bash
  npm install --prefix apps/owner-mobile
  npm run owner-mobile:start
  ```
- Configure `EXPO_PUBLIC_API_BASE_URL` (e.g., `http://localhost:3000`) in your shell so the app points to the backend when running on emulators or devices.

## Scenario flows

### WhatsApp booking & approval
```mermaid
sequenceDiagram
  participant Customer
  participant WhatsApp
  participant Webhook as /webhook (Express)
  participant BookingSvc as bookingService
  participant LLM as conversationService
  participant Owner as Owner portal

  Customer->>WhatsApp: "Need a haircut tomorrow"
  WhatsApp-->>Webhook: POST /webhook (JSON)
  Webhook->>BookingSvc: handleIncomingChange
  BookingSvc->>LLM: evaluateUserMessage
  LLM-->>BookingSvc: {action: SHOW_AVAILABILITY, service: haircut}
  BookingSvc->>Customer: sendButtons("Pick a time")
  Customer->>WhatsApp: taps slot
  WhatsApp-->>Webhook: POST /webhook (slot button)
  BookingSvc->>Calendar: createTentativeEvent + savePendingBooking
  BookingSvc->>Customer: sendButtons("Approve / Reject")
  note over Owner: sees pending booking in owner portal
  Owner->>Owner: Approve
  Owner->>BookingSvc: POST /owner/approve → confirmEvent
  BookingSvc->>Customer: sendText("Approved ✅ ...")
```

### Booking app funnel
1. Customer opens `https://booking.yourdomain.com/?tenant=<key>`.
2. App fetches `/public/tenants/:key`, `/services`, `/availability`.
3. User selects service, date range, slot → sees summary including price/duration.
4. User chooses OTP channel (phone/email), receives and verifies code.
5. App submits POST `/public/tenants/:key/bookings` with slot + contact info + OTP token.
6. Server stores pending booking, logs analytics, and optionally sends WhatsApp confirmation via `sendText`.
7. Owner approves/rejects via portal; customer receives WhatsApp update.

### Admin onboarding flow
1. Operator logs into admin portal with API key.
2. Creates tenant:
   - Display name, tenant key, timezone.
   - WABA phone-number ID + access token.
   - Services (ID, min/max minutes, price).
   - Default calendar rules (working hours/capacity).
3. Admin shares tenant key + owner token with the owner.
4. Owner logs into owner portal, updates service catalog/calendars if needed.
5. Tenant configures their WhatsApp Business phone number to point at the shared webhook URL and grants the app messaging permissions.
6. System ready to receive inquiries via WhatsApp or booking app.

## Timeline & Feature Plan

| Quarter | Focus | Status |
|---------|-------|--------|
| **Q4 2025** | Finish MVP backend + portals, internal calendar, booking web app, documentation | ✅ Completed (feature freeze, tests passing) |
| **Q1 2026** | Harden secrets/compliance, finalize AWS/Kubernetes deployment, set up monitoring & scheduled jobs | 🟡 In progress |
| **Q2 2026** | Build owner mobile companion (login, approvals, calendar, push notifications) and pilot with first tenants | 🔜 Planned |
| **Q3 2026** | Launch marketplace foundations: tenant storefront APIs, product catalog service, consumer mobile MVP | 🔜 Planned |
| **Q4 2026** | Monetization & marketing: ads/promotions tooling, analytics dashboards, advanced guardrails/content moderation | 🔜 Planned |

*Legend: ✅ Complete · 🟡 In progress · 🔜 Not started*

## Running everything locally

1. **Bootstrap**
   ```bash
   ./scripts/bootstrap.sh   # installs root deps, scaffolds .env, prints checklist
   ```
   Update `.env` with WhatsApp + OpenAI secrets, Postgres URL, admin keys, owner JWT secret, and optional retention windows.

2. **Database**
   - For Postgres via Docker: `docker compose up db`.
   - For tests, `DATABASE_URL=memory` triggers `pg-mem`.

3. **Backend**
   ```bash
   npm run dev
   ```
   Exposes `http://localhost:3000`. For WhatsApp webhook testing use ngrok: `npx ngrok http 3000`.

4. **Admin portal**
   ```bash
   npm run admin:dev
   ```
   Visit http://localhost:5173 (or whichever Vite port) and supply an admin token + actor info.

5. **Owner portal**
   ```bash
   npm run owner:dev
   ```
   Visit http://localhost:5174, enter tenant key + owner token.

6. **Tests**
  ```bash
  npm test
  ```
  Runs Vitest suite: webhook verification, tenant validation, availability logic, owner portal integration, retention pruning, env validation.

### Required secrets and configuration
- **WhatsApp**: Meta app webhook configured once → `.env` requires `APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and per-tenant WABA tokens entered via admin portal.
- **OpenAI**: `OPENAI_API_KEY` and `OPENAI_MODEL` (defaults to `gpt-4.1-mini`) for conversation intents.
- **Database**: `DATABASE_URL` (e.g., `postgres://user:pass@host:5432/chatbot`). Tests may use `memory`.
- **Admin**: `ADMIN_API_KEYS` comma-separated list; front-end sends `Authorization: Bearer <key>`.
- **Owner portal**: `OWNER_JWT_SECRET` for signing owner sessions.
- **Retention**: `PENDING_RETENTION_HOURS`, `APPOINTMENT_RETENTION_DAYS`, `CUSTOMER_RETENTION_DAYS`.
- **CORS**: `ADMIN_ALLOW_ORIGINS` optional list for admin app.

## Operational scripts

- `npm run retention:prune` – executes `scripts/prune-data.js` to delete stale pending bookings, old appointments, and inactive customers per env vars.
- `npm run admin:build` / `npm run owner:build` – produce production bundles.

## Current feature set

- Multi-tenant onboarding & CRUD via REST/admin portal.
- Per-tenant service catalogs, calendars, pending booking management.
- WhatsApp webhook with signature verification, LLM-driven responses, button flows, and calendar integration.
- Owner portal with login, pending approvals, analytics summary, appointments, customer list/detail, service management, CSV exports.
- Structured logging, audit trail, and configurable data retention.

## Remaining work before first tenant

1. **Secret management hardening**
   - Move `.env` secrets into a managed store (AWS Secrets Manager/SSM, Doppler, etc.) and document rotation playbooks.
   - Ensure tenant-specific WhatsApp tokens are rotated and distributed securely.
2. **Production deployment**
   - Finalize AWS/Kubernetes deployment manifests, including HTTPS ingress, horizontal scaling, and CI/CD automation for backend + frontends.
   - Wire `npm run retention:prune` into a scheduled job (CronJob/Cron) with monitoring.
3. **Compliance & policy**
   - Publish privacy policy/data retention commitments for tenants.
   - Ensure admin access requires SSO/VPN and centralized logging (CloudWatch/Datadog) for audit evidence.
4. **Operational readiness**
   - Add monitoring/alerting for webhook delivery, WhatsApp API failures, queue backlogs.
   - Prepare tenant onboarding runbook (how to collect WABA credentials, share owner token, configure calendars).
5. **Optional niceties**
   - Admin UX polish (role-based enforcement, analytics dashboards).
   - Self-serve tenant signup + billing if needed for GTM.

With these items addressed, the platform will be ready to onboard the first production tenant with confidence.
