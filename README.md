## WhatsApp Chatbot SaaS Starter

Multi-tenant WhatsApp Business webhook starter with calendar integration for salon-style booking bots.

### Quick start

```bash
./scripts/bootstrap.sh
# (fills node_modules, creates .env if missing, prints next steps)
```

1. Edit `.env` with your sandbox `WHATSAPP_VERIFY_TOKEN`, `WABA_TOKEN`, `PHONE_NUMBER_ID`, optional `APP_SECRET`, and (for AI responses) `OPENAI_API_KEY`.
2. Start the webhook server: `npm run dev`
3. Expose port 3000: `npx ngrok http 3000`
4. In Meta App → WhatsApp → Configuration  
   • Callback URL: `https://<your-ngrok>/webhook`  
   • Verify Token: same value as `WHATSAPP_VERIFY_TOKEN`  
   • Subscribe to `messages`, `message_status`, `message_template_status_update`

Tenant secrets live in `.env`; keep `src/tenants/tenants.json` without tokens so checked-in defaults stay safe. Runtime state (pending approvals, etc.) is written to `data/pending-bookings.json` and survives restarts.

### Data storage model

- Tenants, calendars, and service catalogs live in `src/tenants/tenants.json`. The admin portal and API mutate this file—back it up or sync to an external store if you need history.
- Pending bookings are persisted in `data/pending-bookings.json` (auto-created). Mount this directory in Docker deployments to retain approval state.
- Admin activity is written to `data/admin-activity.json`; the audit feed in the portal reads from here.
- Extend these JSON documents if you need custom prompts or settings; the backend will surface new fields and the admin UI can be adapted quickly.

### Tenant management API (local development)

- Set `ADMIN_API_KEYS` in `.env` (comma-separated bearer tokens). Include one using `Authorization: Bearer <token>` on every request.
- `GET /tenants` — list tenants with service + calendar metadata (`wabaTokenPreview` shows last 4 chars).
- `GET /tenants/:key` — fetch a single tenant; append `?includeSensitive=true` to expose raw tokens (only for trusted local use).
- `POST /tenants` — register a tenant. Body accepts `displayName`, `wabaToken`, `phoneNumberId`, optional `graphVersion`, `calendar`, and `services`.
- `PATCH /tenants/:key` — update metadata, calendar settings, or service catalog. Omitting a field leaves it unchanged.
- `POST /tenants/:key/rotate-token` — rotate the WhatsApp access token with `{ "token": "..." }`.
- `DELETE /tenants/:key` — remove a tenant (default tenant is protected).
- Payloads are validated; invalid requests return HTTP 422 with field-level details. Optionally send `X-Admin-Actor: <name>` to tag structured logs.
- `GET /tenants/activity?limit=50` — retrieve recent admin actions for audit views. Supply `X-Admin-Actor`/`X-Admin-Role` on every request for attribution.

> ⚠️ Treat bearer tokens like secrets. Rotate them regularly and serve the admin routes behind VPN or zero-trust access in production.

### Sample tenants

The project ships with three sandbox businesses you can switch between in the admin portal:

| Key              | Business          | Timezone            | Highlights                          |
|------------------|-------------------|---------------------|-------------------------------------|
| `default`        | Demo Salon        | America/New_York    | Haircut, color, manicure            |
| `beachside-spa`  | Beachside Spa     | America/Los_Angeles | Massage, facials, spa treatments    |
| `urban-groomers` | Urban Groomers    | Europe/London       | Barber-focused services and colors  |

Assign each one its own WhatsApp sandbox credentials before testing multi-tenant flows.

### Admin portal UI

- Frontend lives in `apps/admin` (Vite + React). Install deps with `npm install` inside that folder, then run `npm run dev` to launch on port 5173.
- Or use root scripts: `npm run admin:dev` for development and `npm run admin:build` for production bundles.
- Set `ADMIN_API_KEYS` in `.env` and pass the same token via the portal connect form.
- Provide an admin display name and choose a role (owner/operator/viewer). These values are forwarded as `X-Admin-Actor` and `X-Admin-Role` headers for audit tracking.
- Features: tenant roster with inspect/delete actions, create/update forms for services + calendar settings, token rotation, delete (non-default tenants). Toggle “Show raw tokens” to fetch sensitive fields.
- The portal persists the last-used base URL and token in `localStorage`; use the Disconnect button to clear it.
- Audit trail panel surfaces the latest tenant changes by reading from `GET /tenants/activity`.

### Availability & calendar

- Configure `calendar.timezone`, `slotDurationMinutes`, and `workingHours` per tenant in `src/tenants/tenants.json`.
- When `calendar.enabled` is `true` and Google credentials are supplied, the bot calls the Calendar API `freebusy` endpoint to surface the next open slots.
- With calendar disabled, slots are generated from the working-hours schedule so you can demo the flow without Google OAuth.
- Slot picks are stored on disk and acknowledgements reuse the tenant timezone so approvals persist across restarts.

### Docker deployment

1. Ensure `.env` contains your runtime configuration (`ADMIN_API_KEYS`, `ADMIN_ALLOW_ORIGINS`, WhatsApp/OpenAI secrets).
2. Build and start both services: `docker compose up --build`.
   - Backend API: http://localhost:3000
   - Admin portal: http://localhost:4173
3. In the admin UI connect form, use base URL `http://localhost:3000` plus a token from `ADMIN_API_KEYS`.
4. Tenant definitions (`src/tenants/tenants.json`) and pending bookings (`data/`) are mounted into the containers so updates persist between restarts. Swap these bind mounts for managed volumes or a database before production rollout.

> Add HTTPS termination (e.g., Traefik, nginx) and tighten firewall rules when exposing outside your local machine.

### Service catalog

- Declare each salon service under `services` in `src/tenants/tenants.json` (id, name, min/max duration minutes, price, optional keywords/description).
- Slot lengths adapt automatically to the selected service (e.g., color uses 90 minutes vs. haircut 45 minutes).
- The assistant references service pricing/durations when suggesting times and stores the chosen service with the pending booking for owner approvals.

### AI conversation

- Provide `OPENAI_API_KEY` (and optional `OPENAI_MODEL`, default `gpt-4.1-mini`) to enable natural-language understanding powered by OpenAI.
- The assistant detects intents (bookings, status checks, cancellations, FAQs) and automatically shows availability or replies with context-aware answers.
- Responses mirror the language of the customer (supports English, Hebrew, Arabic out of the box; other languages fall back to English unless handled by the LLM).
- Without an API key, a rules-based fallback still handles core booking triggers so demos continue to work.

### Health check

- `curl -I http://localhost:3000/webhook` should return `403` (signature required).  
- `curl -G "http://localhost:3000/webhook" --data-urlencode "hub.mode=subscribe" --data-urlencode "hub.verify_token=$WHATSAPP_VERIFY_TOKEN" --data-urlencode "hub.challenge=test"` should echo `test`.  
- After connecting the sandbox, send “book” from your test WhatsApp number and confirm the bot replies with slot options.  
- Review logs in the terminal for JSON lines structured by `src/utils/logger.js`.

### Scripts

- `scripts/bootstrap.sh` – installs dependencies, scaffolds `.env`, and prints setup checklist.
- `npm run dev` – runs the Express webhook server on port 3000.
