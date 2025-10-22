import OpenAI from "openai";
import { logger } from "../utils/logger.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const FALLBACK_MESSAGES = {
  introduction: {
    default: "Hi! I'm your virtual salon assistant. I can help with bookings, hours, and services.",
    he: "היי! אני העוזרת הווירטואלית של הסלון. אפשר לעזור בקביעת תורים ושאלות על השירותים.",
    ar: "مرحباً! أنا المساعدة الافتراضية للصالون. أستطيع مساعدتك في حجز المواعيد أو الإجابة عن الأسئلة."
  },
  unavailable: {
    default: "I'm struggling to understand that request right now. Try asking about booking a time or our services.",
    he: "קצת קשה לי להבין את הבקשה. נסה לבקש תור או לשאול על השירותים שלנו.",
    ar: "أواجه صعوبة في فهم الطلب الآن. جرّب أن تطلب موعداً أو تسأل عن خدمات الصالون."
  }
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
    const fallback = pickLocalized("unavailable", detectLanguage(text));
    return { action: "UNKNOWN", response: fallback };
  }

  const inferredLang = detectLanguage(text);

  if (client) {
    try {
      const systemPrompt = buildSystemPrompt(tenant, pendingBooking, inferredLang);
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
        return normalizeResult(parsed, tenant, pendingBooking, inferredLang);
      }
      logger.warn("LLM returned empty content; using fallback");
    } catch (err) {
      logger.warn("LLM evaluation failed; using fallback", "llm", { error: err.message });
    }
  }

  return ruleBasedFallback({ tenant, text, pendingBooking, inferredLang });
}

function buildSystemPrompt(tenant, pendingBooking, lang) {
  const salonName = tenant?.displayName || "the salon";
  const timezone = tenant?.calendar?.timezone || "UTC";
  return [
    `You are an AI assistant for ${salonName}.`,
    "You must respond in the salon's tone: friendly, concise, helpful.",
    "Detect the language of the customer message and WRITE YOUR ENTIRE RESPONSE in that language unless the user explicitly requests another language.",
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
      : "There is no pending booking right now.",
    `Return JSON using the provided schema. If you mention dates/times, include them in the customer's language (${lang || "unknown"}).`
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

function normalizeResult(result, tenant, pendingBooking, lang) {
  const action = result.action || "UNKNOWN";
  let response = (result.response || "").trim();
  if (!response) response = defaultResponseForAction(action, tenant, pendingBooking, lang);
  return {
    action,
    response,
    service: result.service?.trim() || null,
    preferred_time: result.preferred_time?.trim() || null
  };
}

function ruleBasedFallback({ tenant, text, pendingBooking, inferredLang }) {
  const lower = text.toLowerCase();
  const language = inferredLang || "default";
  if (pendingBooking && /(status|confirm|approved|pending|update)/.test(lower)) {
    return {
      action: "PENDING_STATUS",
      response: pickLocalized(
        "pending_status",
        language,
        pendingBooking.slotLabel || "the requested time"
      )
    };
  }
  if (/(cancel|can't make it|reschedule|בטל|לבטל|الغاء|إلغاء)/.test(lower)) {
    return {
      action: "CANCEL_BOOKING",
      response: pickLocalized("cancel_hint", language)
    };
  }
  if (/(book|appointment|schedule|hair|nail|massage|available|slot|time|תור|שעה|book me|حجز|موعد)/.test(lower)) {
    return {
      action: "SHOW_AVAILABILITY",
      response: pickLocalized("show_slots", language)
    };
  }
  if (/(hi|hello|hey|thanks|thank you|תודה|שלום|مرحبا|شكرا)/.test(lower)) {
    return {
      action: "ANSWER",
      response: pickLocalized("greeting", language, tenant?.displayName || "the salon")
    };
  }
  const fallback = pickLocalized("unavailable", language);
  return {
    action: "UNKNOWN",
    response: fallback
  };
}

function defaultResponseForAction(action, tenant, pendingBooking, lang) {
  switch (action) {
    case "SHOW_AVAILABILITY":
      return pickLocalized("show_slots", lang);
    case "PENDING_STATUS":
      return pendingBooking
        ? pickLocalized("pending_status", lang, pendingBooking.slotLabel || "the requested time")
        : pickLocalized("pending_none", lang);
    case "CANCEL_BOOKING":
      return pickLocalized("cancel_hint", lang);
    case "ESCALATE":
      return pickLocalized("escalate", lang);
    case "ANSWER":
      return pickLocalized("greeting", lang, tenant?.displayName || "the salon");
    default:
      return pickLocalized("unavailable", lang);
  }
}

function detectLanguage(text = "") {
  if (!text) return "default";
  const sample = text.slice(0, 64);
  if (/[א-ת]/.test(sample)) return "he";
  if (/[ء-ي]/.test(sample)) return "ar";
  return "default";
}

const LOCALIZED_STRINGS = {
  show_slots: {
    default: "Sure! Here are the next available slots.",
    he: "בשמחה! הנה התורים הפנויים הקרובים.",
    ar: "بكل سرور! هذه المواعيد المتاحة قريباً."
  },
  pending_status: {
    default: (slot) => `We're still waiting for the owner to approve your booking for ${slot}. We'll update you soon.`,
    he: (slot) => `אנחנו עדיין מחכים לאישור עבור ${slot}. נעדכן אותך בקרוב.`,
    ar: (slot) => `ما زلنا ننتظر الموافقة على حجز ${slot}. سنخبرك قريباً.`
  },
  pending_none: {
    default: "I couldn't find a pending booking. Want me to show the next openings?",
    he: "לא מצאתי הזמנה ממתינה. רוצה לראות את התורים הפנויים הבאים?",
    ar: "لم أجد حجزاً قيد الانتظار. هل تود رؤية المواعيد المتاحة التالية؟"
  },
  cancel_hint: {
    default: "No problem. Reply with the 'Reject' button to cancel, or ask for another time.",
    he: "אין בעיה. לחץ על כפתור 'Reject' כדי לבטל, או בקש זמן אחר.",
    ar: "لا مشكلة. اضغط على زر 'Reject' للإلغاء أو اطلب موعداً آخر."
  },
  greeting: {
    default: (name) => `Hi! I'm the assistant for ${name}. How can I help today?`,
    he: (name) => `שלום! אני העוזרת הווירטואלית של ${name}. איך אפשר לעזור?`,
    ar: (name) => `مرحباً! أنا المساعدة الافتراضية لـ${name}. كيف أستطيع مساعدتك؟`
  },
  escalate: {
    default: "I'll let the salon know you'd like a human to respond. Expect a follow-up soon.",
    he: "אעדכן את הסלון שאתה מעוניין לדבר עם נציג. נחזור אליך בקרוב.",
    ar: "سأبلغ الصالون بأنك ترغب بالتواصل مع شخص. سنتواصل معك قريباً."
  },
  unavailable: FALLBACK_MESSAGES.unavailable
};

function pickLocalized(key, lang = "default", arg = null) {
  const table = LOCALIZED_STRINGS[key] || FALLBACK_MESSAGES[key] || LOCALIZED_STRINGS.unavailable;
  const entry = table[lang] || table.default || LOCALIZED_STRINGS.unavailable.default;
  if (typeof entry === "function") return entry(arg || "");
  return entry;
}
