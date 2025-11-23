## WhatsApp Chatbot SaaS Starter

Multi-tenant WhatsApp Business webhook starter with calendar integration for salon-style booking bots.

### Quick start

```bash
./scripts/bootstrap.sh
# installs deps, creates .env, prints next steps
```

1. **Configure secrets** – update `.env` with `WHATSAPP_VERIFY_TOKEN`, `WABA_TOKEN`, `PHONE_NUMBER_ID`, `APP_SECRET` (if verifying signatures), `DATABASE_URL`, `ADMIN_API_KEYS`, `OWNER_JWT_SECRET`, and `OPENAI_API_KEY`.  
   • For local Postgres run `docker compose up db`. Default creds: `postgres://chatbot:chatbot@localhost:5432/chatbot`.
2. **Start services** – `npm run dev` runs the webhook server/admin/owner APIs. Use `npm run admin:dev` in `apps/admin` to hack on the admin portal UI if needed.
3. **Expose webhook** – `npx ngrok http 3000`, then in Meta App → WhatsApp → Configuration set:  
   • Callback URL `https://<ngrok>/webhook`  
   • Verify Token = `WHATSAPP_VERIFY_TOKEN`  
   • Subscriptions: `messages`, `message_status`, `message_template_status_update`
4. **Admin portal** – `npm run admin:dev` and visit http://localhost:5173. Connect with `Authorization: Bearer <ADMIN_API_KEY>`. Create/rotate tenants, tokens, services.
5. **Owner portal** – share each tenant’s `ownerToken` (rotate via `POST /tenants/:key/owner-token`). Owners go to `http://localhost:3000/owner/portal`, enter tenant key + token, and manage pending bookings.

Tenant secrets live in `.env`; keep `src/tenants/tenants.json` token-free so seeded defaults are safe. Postgres stores tenants/services/customers/pending bookings; `data/admin-activity.json` tracks admin actions.

### Data storage model

- Postgres (configure with `DATABASE_URL`) stores tenants, services, customers, pending bookings, and confirmed appointments. On first boot, `src/tenants/tenants.json` seeds the database with sample tenants; after that everything is persisted in SQL.
- Admin activity is written to `data/admin-activity.json`; the audit feed in the portal reads from here.
- Tests run against an in-memory Postgres instance by setting `DATABASE_URL=memory` (handled automatically via `npm test`).

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
- `GET /tenants/:key/pending-bookings` — list pending WhatsApp requests for that tenant.
- `POST /tenants/:key/pending-bookings/:customerId/approve|reject` — approve or reject a booking (sends confirmation back to the customer, updates calendar if enabled).
- `POST /tenants/:key/owner-token` — rotate the owner portal token you share with that tenant.

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
- Pending approvals panel lets owners review and approve/reject WhatsApp bookings without sending manual commands.
- Run `npm run admin:bundle` to emit `apps/admin/dist.tar.gz` for static hosting; CI uploads the same bundle as a build artifact.
- `npm test` – run the vitest unit suite (webhook verification, tenant validation, availability logic). Integration tests spin up an in-memory Postgres instance automatically.

### Owner portal (tenants)

- Every tenant has an owner portal token (`ownerTokenPreview` is shown in `/tenants` when `includeSensitive=true`). Rotate tokens with `POST /tenants/:key/owner-token`.
- Owners can either use the static `/owner/portal` page (quick demo) **or** the dedicated React app in `apps/owner`.
- For the React app, run `npm run owner:dev` (defaults to http://localhost:5174). Set `VITE_API_BASE_URL` in `apps/owner/.env` if your backend runs elsewhere. Build for production with `npm run owner:build` and host the static `apps/owner/dist` output.
- Features today: login via tenant key/token, pending approvals with approve/reject actions, recent approved appointments, customer list, and a read-only service catalog. Calendar link appears when the tenant has Google Calendar enabled.
- If the tenant has Google Calendar enabled, the portal links directly to their calendar (pre-populated via the `calendarId` you configured).
- The portal uses `/owner/login` to issue a JWT and `/owner/pending` plus `/owner/pending/:customerId/approve|reject` to process bookings; responses sync with WhatsApp and Google Calendar automatically.

### Troubleshooting / FAQ

- **Webhook verification fails (403)** – ensure `WHATSAPP_VERIFY_TOKEN` in Meta matches `.env`. If signatures are enabled, confirm `APP_SECRET` is correct and `req.rawBody` is populated (our `express.json` verify hook handles this).
- **WhatsApp sends “Invalid signature” logs** – meta is calling from a secondary IP; double-check ngrok is forwarding HTTPS and `APP_SECRET` is set. Remove `APP_SECRET` to bypass verification during testing.
- **Database connection errors** – verify Postgres is running (`docker compose up db`) and `DATABASE_URL` is reachable. For tests we set `DATABASE_URL=memory`.
- **Owner portal login fails** – rotate the owner token via admin API, copy the new value exactly (tokens are case sensitive), and make sure you’re using the tenant key (e.g., `beachside-spa-xxxx`).
- **Calendar button missing** – only tenants with `calendar.enabled=true` and a `calendarId` see the link. Update their calendar settings via admin portal or JSON seed.
- **Messages not delivered** – confirm `WABA_TOKEN` and `PHONE_NUMBER_ID` are correct and Meta sandbox has your number added. Use the admin audit log to confirm actions reached the API.

### Availability & calendar

- Configure `calendar.timezone`, `slotDurationMinutes`, and `workingHours` per tenant through the admin API/portal; `src/tenants/tenants.json` is only used for seeding the initial database.
- When `calendar.enabled` is `true` and Google credentials are supplied, the bot calls the Calendar API `freebusy` endpoint to surface the next open slots.
- With calendar disabled, slots are generated from the working-hours schedule so you can demo the flow without Google OAuth.
- Slot picks are stored on disk and acknowledgements reuse the tenant timezone so approvals persist across restarts.

### Docker deployment

1. Ensure `.env` contains your runtime configuration (`DATABASE_URL`, `ADMIN_API_KEYS`, `ADMIN_ALLOW_ORIGINS`, WhatsApp/OpenAI secrets).
2. Build and start the stack (backend, admin portal, Postgres): `docker compose up --build`.
   - Backend API: http://localhost:3000
   - Admin portal: http://localhost:4173
   - Postgres: exposed on 5432 (default creds `chatbot/chatbot`, DB `chatbot`)
3. In the admin UI connect form, use base URL `http://localhost:3000` plus a token from `ADMIN_API_KEYS`.
4. Postgres data is stored in `data/postgres` (bind-mount). Admin activity logs live in `data/admin-activity.json`.

> Add HTTPS termination (e.g., Traefik, nginx) and tighten firewall rules when exposing outside your local machine.

### Demo & selling kit

- Run through the scripts in `docs/demo-scenarios.md` when showing the product. They cover new bookings, status updates, and owner approvals.
- Capture screenshots/GIFs of the WhatsApp thread plus the admin portal audit log so prospects see both sides of the flow.

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
- `npm run admin:dev` / `npm run admin:build` – run or bundle the React admin portal.
- `npm run admin:bundle` – build and archive the admin portal into `apps/admin/dist.tar.gz`.
- `npm test` – run the vitest unit suite (webhook verification, tenant validation, availability logic).
- GitHub Actions (`.github/workflows/ci.yml`) builds both backend and admin portal on pushes/PRs targeting `main` or `feature/roadmap-plan`.
