# WhatsApp Chatbot SaaS – Delivery Plan

Status legend: `[ ]` Not started · `[~]` In progress · `[x]` Complete

## Core setup & reliability
- [x] Script local bootstrap (install, env, ngrok) and document health checks
- [x] Add error handling for webhook processing and upstream API failures
- [x] Introduce persistence for tenants and bookings (JSON store with disk-backed pending approvals)
- [ ] Enhance booking flow to surface real availability and timezone handling
- [ ] Integrate LLM conversation orchestration (OpenAI) for natural-language booking flows

## Tenant & salon onboarding
- [ ] Build secure endpoints or dashboard for tenant CRUD and token rotation
- [ ] Implement input validation and per-tenant structured logging/metrics
- [ ] Seed sandbox tenants with distinct WhatsApp credentials for demos

## Testing & quality gates
- [ ] Add unit tests for webhook verification, booking flow, and services
- [ ] Create integration/e2e test harness against WhatsApp sandbox mocks
- [ ] Configure CI (GitHub Actions) to run lint/test on each push

## Demo & packaging
- [ ] Prepare scripted demo scenarios with sample conversations/assets
- [ ] Ship owner-facing approval UI or alternate approval workflow
- [ ] Expand README with quickstart, troubleshooting, and video walkthrough

## Security & production readiness
- [ ] Establish secret management strategy across environments
- [ ] Provide Dockerfile/compose (demo) and draft production deployment plan
- [ ] Review compliance needs (data retention, privacy) before go-live
