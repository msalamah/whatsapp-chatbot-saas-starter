import { sendButtons, sendText } from "./whatsappService.js";
import { getTenantByPhoneNumberId } from "../tenants/tenantManager.js";
import { createTentativeEvent, confirmEvent, cancelEvent } from "./calendarService.js";
import { logger } from "../utils/logger.js";

const pending = new Map();

export async function handleIncomingChange(change) {
  const value = change.value || {};
  const metadata = value.metadata || {};
  const phoneNumberId = metadata.phone_number_id;
  const tenant = getTenantByPhoneNumberId(phoneNumberId);

  const messages = value.messages || [];
  const statuses = value.statuses || [];

  for (const st of statuses) { logger.info("status", "webhook", st); }

  for (const msg of messages) {
    const from = msg.from;
    const type = msg.type;
    let text = null;
    if (type === "text") text = msg.text?.body?.trim();
    if (type === "interactive" && msg.interactive?.type === "button_reply") { text = msg.interactive.button_reply.id; }
    if (type === "interactive" && msg.interactive?.type === "list_reply") { text = msg.interactive.list_reply.id; }

    if (!text) { await sendText(tenant.key, from, "Got it ✅"); continue; }

    if (/^(book|hair|nail|appointment|תור|حجز)/i.test(text)) {
      await sendButtons(tenant.key, from, "Pick a time:", [
        { id: "slot_2025-11-13T14:30:00+02:00", title: "14:30" },
        { id: "slot_2025-11-13T16:30:00+02:00", title: "16:30" }
      ]); continue;
    }

    if (text.startsWith("slot_")) {
      const startISO = text.replace("slot_", "");
      const endISO = new Date(new Date(startISO).getTime() + 45*60000).toISOString();
      const temp = await createTentativeEvent(tenant, "Haircut", startISO, endISO, `Customer ${from}`, [{ email: "owner@example.com" }]);
      const eventId = temp?.id || `dev-${Math.random().toString(36).slice(2)}`;
      pending.set(from, { tenant, eventId });
      await sendButtons(tenant.key, from, "Thanks! Waiting for approval. You can:", [
        { id: "approve_me", title: "Approve (Owner)" },
        { id: "reject_me", title: "Reject" }
      ]); continue;
    }

    if (text === "approve_me") {
      const data = pending.get(from);
      if (!data) { await sendText(tenant.key, from, "No pending booking."); continue; }
      await confirmEvent(data.tenant, data.eventId);
      await sendText(tenant.key, from, "Approved ✅ See you then!");
      pending.delete(from); continue;
    }

    if (text === "reject_me") {
      const data = pending.get(from);
      if (!data) { await sendText(tenant.key, from, "No pending booking."); continue; }
      await cancelEvent(data.tenant, data.eventId);
      await sendText(tenant.key, from, "Cancelled ❌");
      pending.delete(from); continue;
    }

    await sendText(tenant.key, from, "Hi! I can help you book a service. Say 'book' to get started.");
  }
}
