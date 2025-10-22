import OpenAI from "openai";
import { logger } from "../utils/logger.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const FALLBACK_MESSAGES = {
  introduction: "Hi! I'm your virtual salon assistant. I can help with bookings, hours, and services.",
  unavailable: "I'm struggling to understand that request right now. Try asking about booking a time or our services."
};

const RESPONSE_SCHEMA = {
  name: "salon_chatbot_plan",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["SHOW_AVAILABILITY", "PENDING_STATUS", "CANCEL_BOOKING", "ANSWER", "ESCALATE", "UNKNOWN"]
      },
      response: { type: "string" },
      service: { type: "string" },
      preferred_time: { type: "string", description: "Natural language preferred time expression, if any." }
    },
    required: ["action", "response"],
    additionalProperties: false
  }
};

export async function evaluateUserMessage({ tenant, text, pendingBooking = null }) {
  if (!text) {
    return { action: "UNKNOWN", response: FALLBACK_MESSAGES.unavailable };
  }

  if (client) {
    try {
      const systemPrompt = buildSystemPrompt(tenant, pendingBooking);
      const userPrompt = buildUserPrompt(text, pendingBooking);
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: RESPONSE_SCHEMA
        }
      });
      const content = response.output?.[0]?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        return normalizeResult(parsed, tenant, pendingBooking);
      }
      logger.warn("LLM returned empty content; using fallback");
    } catch (err) {
      logger.warn("LLM evaluation failed; using fallback", "llm", { error: err.message });
    }
  }

  return ruleBasedFallback({ tenant, text, pendingBooking });
}

function buildSystemPrompt(tenant, pendingBooking) {
  const salonName = tenant?.displayName || "the salon";
  const timezone = tenant?.calendar?.timezone || "UTC";
  return [
    `You are an AI assistant for ${salonName}.`,
    "You must respond in the salon's tone: friendly, concise, helpful.",
    "Detect user intent and choose one ACTION from:",
    " - SHOW_AVAILABILITY: user wants to book or change an appointment.",
    " - PENDING_STATUS: user asks about existing pending booking or approval.",
    " - CANCEL_BOOKING: user wants to cancel upcoming booking.",
    " - ANSWER: user asks general question that you can answer directly.",
    " - ESCALATE: user explicitly asks for a human or has an issue you cannot solve.",
    " - UNKNOWN: you cannot determine the intent.",
    "Always include a helpful short reply in the response field.",
    `Current timezone: ${timezone}.`,
    pendingBooking
      ? `Pending booking exists: ${pendingBooking.slotLabel || pendingBooking.startISO}, awaiting owner approval.`
      : "There is no pending booking right now."
  ].join("\n");
}

function buildUserPrompt(text, pendingBooking) {
  return [
    "Customer message:",
    text,
    pendingBooking
      ? `Customer currently waiting for approval of ${pendingBooking.slotLabel || pendingBooking.startISO}.`
      : "Customer has no pending booking on file."
  ].join("\n");
}

function normalizeResult(result, tenant, pendingBooking) {
  const action = result.action || "UNKNOWN";
  let response = (result.response || "").trim();
  if (!response) response = defaultResponseForAction(action, tenant, pendingBooking);
  return {
    action,
    response,
    service: result.service?.trim() || null,
    preferred_time: result.preferred_time?.trim() || null
  };
}

function ruleBasedFallback({ tenant, text, pendingBooking }) {
  const lower = text.toLowerCase();
  if (pendingBooking && /(status|confirm|approved|pending|update)/.test(lower)) {
    return {
      action: "PENDING_STATUS",
      response: `We're still waiting for the owner to approve your booking for ${pendingBooking.slotLabel || "the requested time"}. We'll send an update soon.`
    };
  }
  if (/(cancel|can't make it|reschedule)/.test(lower)) {
    return {
      action: "CANCEL_BOOKING",
      response: "No problem. Reply with the button 'Reject' to cancel the pending booking, or let us know a better time."
    };
  }
  if (/(book|appointment|schedule|hair|nail|massage|available|slot|time)/.test(lower)) {
    return {
      action: "SHOW_AVAILABILITY",
      response: "Sure! Here are the next available slots."
    };
  }
  if (/(hi|hello|hey|thanks|thank you)/.test(lower)) {
    return {
      action: "ANSWER",
      response: `Hi! I'm the assistant for ${tenant?.displayName || "the salon"}. I can help you book or answer questions.`
    };
  }
  return {
    action: "UNKNOWN",
    response: FALLBACK_MESSAGES.unavailable
  };
}

function defaultResponseForAction(action, tenant, pendingBooking) {
  switch (action) {
    case "SHOW_AVAILABILITY":
      return "Absolutely! Let me share the next open slots.";
    case "PENDING_STATUS":
      return pendingBooking
        ? `We're waiting for the team to approve your booking for ${pendingBooking.slotLabel || "the requested time"}.`
        : "I couldn't find a pending booking. Would you like to book a new appointment?";
    case "CANCEL_BOOKING":
      return "Okay, I'll cancel that. Let me know if you'd like a different time.";
    case "ESCALATE":
      return "I'll let the salon know you'd like to speak with someone. Expect a follow-up soon.";
    case "ANSWER":
      return `This is ${tenant?.displayName || "our"} assistant. How can I help you today?`;
    default:
      return FALLBACK_MESSAGES.unavailable;
  }
}
