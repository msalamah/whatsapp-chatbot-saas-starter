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

### Availability & calendar

- Configure `calendar.timezone`, `slotDurationMinutes`, and `workingHours` per tenant in `src/tenants/tenants.json`.
- When `calendar.enabled` is `true` and Google credentials are supplied, the bot calls the Calendar API `freebusy` endpoint to surface the next open slots.
- With calendar disabled, slots are generated from the working-hours schedule so you can demo the flow without Google OAuth.
- Slot picks are stored on disk and acknowledgements reuse the tenant timezone so approvals persist across restarts.

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
