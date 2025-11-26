# Security & Compliance Guide

This document tracks the MVP security posture and the hygiene tasks required before inviting external tenants into the WhatsApp chatbot platform.

## Secret management

| Secret | Description | Storage guidance |
|--------|-------------|------------------|
| `WHATSAPP_VERIFY_TOKEN`, `WABA_TOKEN`, `PHONE_NUMBER_ID`, tenant-specific WhatsApp tokens | Required to configure Meta webhook + send messages | Store per-environment values in a secret manager (AWS Secrets Manager or SSM Parameter Store). Never commit tenant tokens. Rotate on tenant off-boarding or when sharing owner portal access. |
| `ADMIN_API_KEYS` | Comma-separated list of admin bearer tokens | Generate per operator/automation. Distribute using a vault or short-lived secure channel (1Password share). Rotate monthly or when anyone leaves the team. |
| `OWNER_JWT_SECRET` | Signs owner portal sessions | Keep unique per environment. Rotate when rotating owner portal tokens. |
| `DATABASE_URL`, `OPENAI_API_KEY`, Google calendar OAuth files | Backend persistence + AI + scheduling access | Use environment-specific secrets; restrict Google credential files via IAM and limit their scope. |

**Local development** – `.env` is fine, but prefer `direnv` + 1Password or Doppler to inject secrets.  
**Staging/production** – run containers/Pods with secrets fetched from AWS Secrets Manager or Parameter Store via init containers. Only mount tenant WhatsApp tokens per tenant row in Postgres; never inject them as global env vars.

Rotation procedure:

1. Rotate WhatsApp access tokens via Meta → update tenant via Admin portal (`POST /tenants/:key/rotate-token`).  
2. Rotate owner portal tokens via `POST /tenants/:key/owner-token` and send the new value to the tenant via secure channel.  
3. Update `OWNER_JWT_SECRET` and `ADMIN_API_KEYS` at the same time; redeploy, invalidate outstanding owner JWTs, and notify admins of new bearer strings.

## Data retention & privacy

The backend now enforces configurable retention windows:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PENDING_RETENTION_HOURS` | `48` | Auto-expire pending bookings that owners never actioned. |
| `APPOINTMENT_RETENTION_DAYS` | `730` | Drop historical appointment rows older than ~2 years unless you need them for analytics. |
| `CUSTOMER_RETENTION_DAYS` | `365` | Remove inactive customers without pending/ongoing appointments after one year. |

Use `npm run retention:prune` (or schedule the script in cron/K8s CronJobs) to execute deletions. The script logs a JSON summary via `logger.info` so you can collect metrics or alerts when rows are deleted.

Retention best practices:

- Run the prune script at least daily in production.  
- Lower retention windows for GDPR/CCPA tenants who request aggressive deletion policies.  
- When a tenant asks for a complete export or deletion, use the CSV exports (`/owner/exports/...`) plus the prune script with temporarily tightened windows.

## Access control & auditing

- Admin APIs require `Authorization: Bearer <ADMIN_API_KEY>` and all routes go through `adminAuth`. Admin actions append to `data/admin-activity.json` which fuels the portal audit log.  
- Owner portals issue JWTs signed with `OWNER_JWT_SECRET`; these tokens scope every `/owner/*` route to a tenant. Rotate owner tokens per tenant when staff changes.  
- Webhook requests enforce signature verification (`x-hub-signature-256`) and reject unsigned payloads with HTTP 403.  
- Structured logs (`src/utils/logger.js`) include action context to feed into centralized logging (CloudWatch, Datadog) once deployed.

## Deployment checklist

1. Provision AWS Secrets Manager parameters for each required env var; inject them at deploy time.  
2. Enable HTTPS termination (ALB/Kong/etc.) and block plain HTTP from the public internet.  
3. Run `npm run retention:prune` nightly via CronJob and monitor the log summaries for anomalies.  
4. Enable Postgres encryption at rest + TLS in transit (RDS).  
5. Document tenant data handling in onboarding decks and include redemption/export SLAs.  
6. Before SOC2/GDPR reviews, ensure admin access sits behind SSO/VPN and all logs flow to a tamper-evident store.
