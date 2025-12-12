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
- [x] Ship React/Vite admin portal for tenant management (initial release live; polish UX & analytics)
- [~] Add secure auth & role management for the admin portal (actor/role headers in place, expand enforcement later)
- [x] Integrate audit logging and activity timeline in admin UI
- [x] Deliver deployment bundle and automated build pipeline for the admin app
- [x] Ship owner-facing approval UI (pending bookings dashboard + approve/reject flows)
  - [x] Replace custom calendar timeline with React Big Calendar (day/week/month, timezone-aware, event detail chips)
  - [x] Refresh owner/admin styling for responsive layouts and readable cards

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
- [ ] Tenant-branded web booking app
  - [x] Public tenant/services/availability endpoints (read-only)
  - [x] Web booking flow (service picker, multi-step, availability filtered by duration, contact form)
  - [x] Pending booking created with source metadata (web) for owner approval
  - [x] OTP login (phone/email) with Twilio/SMS + SMTP hooks
  - [ ] Polish booking UI/OTP delivery UX and add per-tenant branding
  - [ ] WhatsApp bot/link handoff to web booking and social links
- [ ] Internal calendar
  - [x] Schema & API for working hours, breaks, capacity per tenant
  - [x] Admin UI to configure calendar (working days, breaks, capacity)
  - [x] Owner portal calendar editor (owners manage working hours/breaks themselves)
  - [x] Availability engine uses internal calendar instead of Google
- [x] Booking web app supports date-range filters using internal calendar availability
- [x] Unified React Big Calendar views across admin, owner, and booking apps (week/day/month, scrollable hours, timezone chip, event chips)
- [ ] Owner mobile companion app (Phase 1)
  - [ ] Define mobile MVP scope (login, approvals, calendar, push notifications)
  - [ ] Build React Native/Expo shell consuming `/owner` APIs
  - [ ] Implement secure JWT refresh + device token registration endpoints
  - [ ] Deliver iOS/Android builds for internal testing

## Security & production readiness
- [~] Establish secret management strategy across environments
  - [ ] Migrate environment secrets to a managed store (AWS Secrets Manager/SSM or similar)
  - [ ] Automate WhatsApp/owner token rotation playbooks and documentation
- [x] Provide Dockerfile/compose (demo) and draft production deployment plan
- [~] Review compliance needs (data retention, privacy) before go-live
  - [ ] Publish tenant-facing privacy/retention policy & onboarding checklist
  - [ ] Schedule and monitor `npm run retention:prune` via CronJob or similar
  - [ ] Implement centralized logging + alerting for webhook failures and approvals SLA
