## WhatsApp Chatbot SaaS Starter

Multi-tenant WhatsApp Business webhook starter with calendar integration for salon-style booking bots.

### Quick start

```bash
./scripts/bootstrap.sh
# (fills node_modules, creates .env if missing, prints next steps)
```

1. Edit `.env` with your sandbox `WHATSAPP_VERIFY_TOKEN`, `WABA_TOKEN`, `PHONE_NUMBER_ID`, and optional `APP_SECRET`.
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

### Health check

- `curl -I http://localhost:3000/webhook` should return `403` (signature required).  
- `curl -G "http://localhost:3000/webhook" --data-urlencode "hub.mode=subscribe" --data-urlencode "hub.verify_token=$WHATSAPP_VERIFY_TOKEN" --data-urlencode "hub.challenge=test"` should echo `test`.  
- After connecting the sandbox, send “book” from your test WhatsApp number and confirm the bot replies with slot options.  
- Review logs in the terminal for JSON lines structured by `src/utils/logger.js`.

### Scripts

- `scripts/bootstrap.sh` – installs dependencies, scaffolds `.env`, and prints setup checklist.
- `npm run dev` – runs the Express webhook server on port 3000.
