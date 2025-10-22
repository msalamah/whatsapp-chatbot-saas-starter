import { sendButtons, sendText } from "./whatsappService.js";
import { getTenantByPhoneNumberId, getTenantByKey } from "../tenants/tenantManager.js";
import { createTentativeEvent, confirmEvent, cancelEvent } from "./calendarService.js";
import { logger } from "../utils/logger.js";
import { savePendingBooking, getPendingBooking, deletePendingBooking } from "./pendingBookingStore.js";
import { getAvailableSlots } from "./availabilityService.js";
import { evaluateUserMessage } from "./conversationService.js";

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
    const pendingData = getPendingBooking(from);

    if (!text) { await sendText(tenant.key, from, "Got it ✅"); continue; }

    if (text === "SHOW_AVAILABILITY") {
      const slots = await getAvailableSlots(tenant, { limit: 3 });
      if (!slots.length) {
        await sendText(tenant.key, from, "Sorry, we're fully booked. Try another time or contact the salon directly.");
      } else {
        const timezone = slots[0].timezone;
        await sendButtons(tenant.key, from, `Pick a time (${timezone}):`, slots.map(slot => ({
          id: `slot_${slot.startISO}`,
          title: slot.buttonLabel
        })));
      }
      continue;
    }

    if (text.startsWith("slot_")) {
      const startISO = text.replace("slot_", "");
      const durationMinutes = tenant.calendar?.slotDurationMinutes || 45;
      const endISO = new Date(new Date(startISO).getTime() + durationMinutes * 60000).toISOString();
      const temp = await createTentativeEvent(tenant, "Haircut", startISO, endISO, `Customer ${from}`, [{ email: "owner@example.com" }]);
      const eventId = temp?.id || `dev-${Math.random().toString(36).slice(2)}`;
      const timeZone = tenant.calendar?.timezone || "UTC";
      const slotLabel = new Date(startISO).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone });
      savePendingBooking(from, { tenantKey: tenant.key, eventId, startISO, endISO, service: "Haircut", slotLabel, timeZone });
      await sendButtons(tenant.key, from, `Thanks! Waiting for approval for ${slotLabel}. You can:`, [
        { id: "approve_me", title: "Approve (Owner)" },
        { id: "reject_me", title: "Reject" }
      ]); continue;
    }

    if (text === "approve_me") {
      const data = pendingData;
      if (!data) { await sendText(tenant.key, from, "No pending booking."); continue; }
      const targetTenant = getTenantByKey(data.tenantKey) || tenant;
      await confirmEvent(targetTenant, data.eventId);
      await sendText(targetTenant.key, from, `Approved ✅ See you on ${data.slotLabel || "the scheduled time"}!`);
      deletePendingBooking(from); continue;
    }

    if (text === "reject_me") {
      const data = pendingData;
      if (!data) { await sendText(tenant.key, from, "No pending booking."); continue; }
      const targetTenant = getTenantByKey(data.tenantKey) || tenant;
      await cancelEvent(targetTenant, data.eventId);
      await sendText(targetTenant.key, from, `Cancelled ❌ ${data.slotLabel ? `The slot ${data.slotLabel} is now open.` : ""}`.trim());
      deletePendingBooking(from); continue;
    }

    const evaluation = await evaluateUserMessage({ tenant, text, pendingBooking: pendingData });
    if (evaluation.action === "SHOW_AVAILABILITY") {
      if (evaluation.response) await sendText(tenant.key, from, evaluation.response);
      const slots = await getAvailableSlots(tenant, { limit: 3 });
      if (!slots.length) {
        await sendText(tenant.key, from, "Sorry, we're fully booked. Try another time or contact the salon directly.");
      } else {
        const timezone = slots[0].timezone;
        await sendButtons(tenant.key, from, `Pick a time (${timezone}):`, slots.map(slot => ({
          id: `slot_${slot.startISO}`,
          title: slot.buttonLabel
        })));
      }
      continue;
    }

    if (evaluation.action === "PENDING_STATUS") {
      if (pendingData) {
        await sendText(tenant.key, from, evaluation.response || `We're still waiting for approval for ${pendingData.slotLabel || "your booking"}.`);
      } else {
        await sendText(tenant.key, from, evaluation.response || "I don't see a pending booking. Want me to show the next slots?");
      }
      continue;
    }

    if (evaluation.action === "CANCEL_BOOKING") {
      if (pendingData) {
        await sendText(tenant.key, from, "To cancel, tap 'Reject' below.");
        await sendButtons(tenant.key, from, "Cancel this booking?", [
          { id: "reject_me", title: "Reject" },
          { id: "SHOW_AVAILABILITY", title: "See other times" }
        ]);
      } else {
        await sendText(tenant.key, from, evaluation.response || "I don't see an upcoming booking to cancel.");
      }
      continue;
    }

    if (evaluation.action === "ESCALATE") {
      await sendText(tenant.key, from, evaluation.response || "I'll let the salon know to reach out to you shortly.");
      continue;
    }

    if (evaluation.action === "ANSWER") {
      await sendText(tenant.key, from, evaluation.response || "Happy to help!");
      continue;
    }

    if (evaluation.action === "UNKNOWN" && evaluation.response) {
      await sendText(tenant.key, from, evaluation.response);
      continue;
    }

    await sendText(tenant.key, from, "Hi! I can help you book a service. Say 'book' to get started.");
  }
}
