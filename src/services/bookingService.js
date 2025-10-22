import { sendButtons, sendText } from "./whatsappService.js";
import {
  getTenantByPhoneNumberId,
  getTenantByKey,
  getServiceById,
  findServiceByText,
  getDefaultService
} from "../tenants/tenantManager.js";
import { createTentativeEvent, confirmEvent, cancelEvent } from "./calendarService.js";
import { logger } from "../utils/logger.js";
import { savePendingBooking, getPendingBooking, deletePendingBooking } from "./pendingBookingStore.js";
import { getAvailableSlots } from "./availabilityService.js";
import { evaluateUserMessage } from "./conversationService.js";

const SLOT_PREFIX = "slot::";
const LEGACY_SLOT_PREFIX = "slot_";
const SHOW_SERVICE_PREFIX = "showservice::";

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
    let rawText = null;
    if (type === "text") rawText = msg.text?.body?.trim();
    if (type === "interactive" && msg.interactive?.type === "button_reply") { rawText = msg.interactive.button_reply.id; }
    if (type === "interactive" && msg.interactive?.type === "list_reply") { rawText = msg.interactive.list_reply.id; }
    const pendingData = getPendingBooking(from);

    if (!rawText) { await sendText(tenant.key, from, "Got it ✅"); continue; }

    if (rawText.startsWith(SLOT_PREFIX) || rawText.startsWith(LEGACY_SLOT_PREFIX)) {
      await handleSlotSelection({ tenant, from, rawText, pendingData });
      continue;
    }

    if (rawText === "approve_me") {
      if (!pendingData) { await sendText(tenant.key, from, "No pending booking."); continue; }
      const targetTenant = getTenantByKey(pendingData.tenantKey) || tenant;
      await confirmEvent(targetTenant, pendingData.eventId);
      await sendText(targetTenant.key, from, `Approved ✅ ${formatConfirmedMessage(pendingData)}`);
      deletePendingBooking(from);
      continue;
    }

    if (rawText === "reject_me") {
      if (!pendingData) { await sendText(tenant.key, from, "No pending booking."); continue; }
      const targetTenant = getTenantByKey(pendingData.tenantKey) || tenant;
      await cancelEvent(targetTenant, pendingData.eventId);
      await sendText(targetTenant.key, from, `Cancelled ❌ ${formatCancelledMessage(pendingData)}`);
      deletePendingBooking(from);
      continue;
    }

    let serviceCommandId = null;
    let normalizedText = rawText;
    if (rawText.startsWith(SHOW_SERVICE_PREFIX)) {
      const parts = rawText.split("::");
      serviceCommandId = parts[1] === "default" ? null : parts[1];
      normalizedText = "SHOW_AVAILABILITY";
    }

    if (normalizedText === "SHOW_AVAILABILITY") {
      const service = resolveService(tenant, serviceCommandId, rawText, pendingData);
      await presentAvailability({ tenant, to: from, service });
      continue;
    }

    const evaluation = await evaluateUserMessage({ tenant, text: rawText, pendingBooking: pendingData });
    const service = resolveService(
      tenant,
      evaluation.serviceId || evaluation.serviceName || serviceCommandId,
      rawText,
      pendingData
    );

    if (evaluation.action === "SHOW_AVAILABILITY") {
      await presentAvailability({
        tenant,
        to: from,
        service,
        preface: evaluation.response,
        language: evaluation.language
      });
      continue;
    }

    if (evaluation.action === "PENDING_STATUS") {
      if (pendingData) {
        await sendText(tenant.key, from, evaluation.response || `We're still waiting for approval for ${formatSlotLabel(pendingData)}.`);
      } else {
        await sendText(tenant.key, from, evaluation.response || "I don't see a pending booking. Want me to show the next openings?");
      }
      continue;
    }

    if (evaluation.action === "CANCEL_BOOKING") {
      if (pendingData) {
        await sendText(tenant.key, from, evaluation.response || "To cancel, tap 'Reject' below.");
        await sendButtons(tenant.key, from, "Cancel this booking?", [
          { id: "reject_me", title: "Reject" },
          { id: encodeShowAvailability(pendingData.serviceId || service?.id), title: "See other times" }
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

    await sendText(tenant.key, from, "Hi! I can help you book a service. Tell me what you need and I'll suggest times.");
  }
}

async function handleSlotSelection({ tenant, from, rawText, pendingData }) {
  const { serviceId, startISO } = decodeSlotSelection(rawText);
  if (!startISO) {
    await sendText(tenant.key, from, "Sorry, I couldn't understand that slot.");
    return;
  }
  const service = resolveService(tenant, serviceId, rawText, pendingData);
  const durationMinutes = computeDurationMinutes(service, tenant);
  const startDate = new Date(startISO);
  const endISO = new Date(startDate.getTime() + durationMinutes * 60000).toISOString();
  const summary = service?.name || "Service Appointment";
  const timezone = tenant.calendar?.timezone || "UTC";
  const slotLabel = startDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });

  const temp = await createTentativeEvent(
    tenant,
    summary,
    startISO,
    endISO,
    `Customer ${from}`,
    [{ email: "owner@example.com" }]
  );
  const eventId = temp?.id || `dev-${Math.random().toString(36).slice(2)}`;

  savePendingBooking(from, {
    tenantKey: tenant.key,
    eventId,
    startISO,
    endISO,
    slotLabel,
    timeZone: timezone,
    serviceId: service?.id || null,
    serviceName: service?.name || "Service",
    servicePrice: service?.price || null,
    serviceCurrency: service?.currency || "USD",
    serviceDescription: service?.description || "",
    durationMinutes
  });

  const approvalMessage = service
    ? `Thanks! Waiting for approval for ${service.name} on ${slotLabel}.`
    : `Thanks! Waiting for approval for ${slotLabel}.`;

  await sendButtons(tenant.key, from, approvalMessage, [
    { id: "approve_me", title: "Approve (Owner)" },
    { id: "reject_me", title: "Reject" }
  ]);
}

async function presentAvailability({ tenant, to, service, preface = null, language = "default" }) {
  if (preface) await sendText(tenant.key, to, preface);

  if (!service) {
    const prompt = localizedPrompt("choose_service", language);
    const options = formatServiceOptions(tenant);
    await sendText(tenant.key, to, `${prompt}\n${options}`);
    return;
  }

  const durationMinutes = computeDurationMinutes(service, tenant);
  const slots = await getAvailableSlots(tenant, { limit: 3, durationMinutes });

  if (!slots.length) {
    await sendText(tenant.key, to, localizedPrompt("fully_booked", language));
    return;
  }

  if (service.price) {
    await sendText(tenant.key, to, `${service.name} · ${formatPrice(service)}`);
  }

  const timezone = slots[0].timezone;
  await sendButtons(tenant.key, to, `Pick a time (${timezone})`, slots.map((slot) => ({
    id: encodeSlotSelection(service.id, slot.startISO),
    title: slot.buttonLabel
  })));
}

function resolveService(tenant, hint, rawText, pendingData) {
  if (!tenant) return null;
  if (hint) {
    const byId = getServiceById(tenant, hint);
    if (byId) return byId;
    const byText = findServiceByText(tenant, hint);
    if (byText) return byText;
  }
  const textMatch = findServiceByText(tenant, rawText || "");
  if (textMatch) return textMatch;
  if (pendingData?.serviceId) {
    const pendingService = getServiceById(tenant, pendingData.serviceId);
    if (pendingService) return pendingService;
  }
  return getDefaultService(tenant);
}

function computeDurationMinutes(service, tenant) {
  if (!service) return tenant.calendar?.slotDurationMinutes || 45;
  const defaultDuration = tenant.calendar?.slotDurationMinutes || 45;
  return Math.max(service.maxMinutes || defaultDuration, defaultDuration);
}

function encodeSlotSelection(serviceId, startISO) {
  return `${SLOT_PREFIX}${serviceId || "default"}::${startISO}`;
}

function decodeSlotSelection(id) {
  if (id.startsWith(SLOT_PREFIX)) {
    const [, serviceId, ...rest] = id.split("::");
    return {
      serviceId: serviceId === "default" ? null : serviceId,
      startISO: rest.join("::") || null
    };
  }
  return {
    serviceId: null,
    startISO: id.replace(LEGACY_SLOT_PREFIX, "")
  };
}

function encodeShowAvailability(serviceId) {
  return `${SHOW_SERVICE_PREFIX}${serviceId || "default"}`;
}

function formatServiceOptions(tenant) {
  if (!tenant?.services?.length) return "- Haircut\n- Manicure\n- Color";
  return tenant.services
    .map((svc) => {
      const price = svc.price ? ` (${formatPrice(svc)})` : "";
      return `• ${svc.name}${price}`;
    })
    .join("\n");
}

function formatPrice(service) {
  if (!service?.price) return "";
  const currency = service.currency || "USD";
  return `${currency} ${service.price}`;
}

function formatSlotLabel(pendingData) {
  if (!pendingData) return "your booking";
  return pendingData.slotLabel || "your booking";
}

function formatConfirmedMessage(pendingData) {
  const base = formatSlotLabel(pendingData);
  if (pendingData.serviceName) {
    return `${pendingData.serviceName} on ${base}`;
  }
  return `See you on ${base}`;
}

function formatCancelledMessage(pendingData) {
  const base = formatSlotLabel(pendingData);
  if (pendingData.serviceName) {
    return `${pendingData.serviceName} on ${base} is now open.`;
  }
  return `${base} is now open.`;
}

const PROMPTS = {
  choose_service: {
    default: "Which service would you like? Here are some options:",
    he: "איזה שירות תרצה? הנה כמה אפשרויות:",
    ar: "أي خدمة ترغب بها؟ إليك بعض الخيارات:"
  },
  fully_booked: {
    default: "Sorry, we're fully booked right now. Try another time or contact the salon directly.",
    he: "מצטערים, אין לנו תורים פנויים כרגע. נסה זמן אחר או צור קשר עם הסלון.",
    ar: "عذراً، لا توجد مواعيد متاحة حالياً. جرّب وقتاً آخر أو تواصل مع الصالون مباشرة."
  }
};

function localizedPrompt(key, language = "default") {
  const table = PROMPTS[key] || {};
  return table[language] || table.default || "";
}
