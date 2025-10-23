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

## Admin web experience
- [~] Ship React/Vite admin portal for tenant management (initial release live; polish UX & analytics)
- [~] Add secure auth & role management for the admin portal (actor/role headers in place, expand enforcement later)
- [x] Integrate audit logging and activity timeline in admin UI
- [ ] Deliver deployment bundle and automated build pipeline for the admin app

## Testing & quality gates
- [ ] Add unit tests for webhook verification, booking flow, and services
- [ ] Create integration/e2e test harness against WhatsApp sandbox mocks
- [x] Configure CI (GitHub Actions) to run lint/test on each push

## Demo & packaging
- [ ] Prepare scripted demo scenarios with sample conversations/assets
- [ ] Ship owner-facing approval UI or alternate approval workflow
- [ ] Expand README with quickstart, troubleshooting, and video walkthrough

## Security & production readiness
- [ ] Establish secret management strategy across environments
- [x] Provide Dockerfile/compose (demo) and draft production deployment plan
- [ ] Review compliance needs (data retention, privacy) before go-live
