# WhatsApp Chatbot SaaS – System Overview

This document summarizes the codebase architecture, subsystems, and local workflows so new contributors can ramp quickly and understand what remains before onboarding the first production tenant.

## High-level architecture

| Layer | Description |
|-------|-------------|
| **Express backend (`src/`)** | Multi-tenant webhook + REST APIs. Handles WhatsApp webhooks, conversation orchestration, tenant CRUD, owner portal APIs, analytics, CSV exports, and persistence. |
| **Admin portal (`apps/admin/`)** | React/Vite app for internal operator use. Connects via bearer tokens to manage tenants, rotate tokens, review audits, and handle pending bookings. |
| **Owner portal (`apps/owner/`)** | React/Vite app for tenant-facing owners. Provides login via owner token, pending approvals, analytics cards, customer/service management, CSV export, etc. |
| **Database** | Postgres (or `pg-mem` for tests) storing tenants, services, customers, pending bookings, appointments. Seeded from `src/tenants/tenants.json` for demos. |
| **External integrations** | WhatsApp Business Cloud API (send/receive messages) and Google Calendar for tentative + confirmed bookings, plus OpenAI for LLM orchestration. |

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
