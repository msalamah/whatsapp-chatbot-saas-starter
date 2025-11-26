# WhatsApp Chatbot SaaS – Delivery Plan

Status legend: `[ ]` Not started · `[~]` In progress · `[x]` Complete

## Core setup & reliability
- [x] Script local bootstrap (install, env, ngrok) and document health checks
- [x] Add error handling for webhook processing and upstream API failures
- [x] Introduce persistence for tenants and bookings (JSON store with disk-backed pending approvals)
- [x] Enhance booking flow to surface real availability and timezone handling
- [x] Integrate LLM conversation orchestration (OpenAI) for natural-language booking flows
- [x] Ensure AI replies mirror customer language automatically
- [x] Model tenant service catalog (duration ranges, pricing) and propagate into booking flow

## Tenant & salon onboarding
- [x] Build secure endpoints or dashboard for tenant CRUD and token rotation (API + bearer auth delivered; expand validation next)
- [x] Implement input validation and per-tenant structured logging/metrics
- [x] Seed sandbox tenants with distinct WhatsApp credentials for demos
- [x] Introduce managed database for tenants, customers, and booking history (replace local JSON stores)

## Admin web experience
- [~] Ship React/Vite admin portal for tenant management (initial release live; polish UX & analytics)
- [~] Add secure auth & role management for the admin portal (actor/role headers in place, expand enforcement later)
- [x] Integrate audit logging and activity timeline in admin UI
- [x] Deliver deployment bundle and automated build pipeline for the admin app
- [x] Ship owner-facing approval UI (pending bookings dashboard + approve/reject flows)

## Testing & quality gates
- [x] Add unit tests for webhook verification, booking flow, and services
- [x] Create integration/e2e test harness against WhatsApp sandbox mocks
- [x] Configure CI (GitHub Actions) to run lint/test on each push

## Demo & packaging
- [x] Prepare scripted demo scenarios with sample conversations/assets
- [x] Ship tenant-facing approval portal (owner login, pending list, calendar view)
  - [x] Owner authentication & routing
  - [x] Pending booking list + approve/reject buttons
  - [x] Google Calendar snapshot or link for confirmed bookings
- [ ] Expand README with quickstart, troubleshooting, and video walkthrough
  - [x] Quickstart & onboarding guide
  - [x] Troubleshooting FAQ
  - [ ] Video walkthrough

## Phase 2 (future initiatives)
- [ ] CRM layer for customer/contact history and marketing insights
- [ ] Owner/operator dashboard (web) to monitor customers and bookings in real time
- [ ] Product catalog & commerce workflows for businesses selling items
- [ ] Self-serve onboarding + billing so customers can purchase the platform online

## Security & production readiness
- [~] Establish secret management strategy across environments
- [x] Provide Dockerfile/compose (demo) and draft production deployment plan
- [~] Review compliance needs (data retention, privacy) before go-live
