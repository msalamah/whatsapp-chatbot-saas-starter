const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(lowered)) return true;
    if (["false", "0", "no"].includes(lowered)) return false;
  }
  if (typeof value === "number") return value === 1;
  return false;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sanitizeWorkingHours(workingHours, errors, opts = { partial: false }) {
  if (!Array.isArray(workingHours)) {
    return opts.partial ? undefined : [];
  }
  const result = [];
  workingHours.forEach((entry, idx) => {
    const day = Number(entry?.day);
    const start = sanitizeString(entry?.start);
    const end = sanitizeString(entry?.end);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      errors.push({ field: `calendar.workingHours[${idx}].day`, message: "day must be between 0 (Sunday) and 6 (Saturday)" });
      return;
    }
    if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
      errors.push({ field: `calendar.workingHours[${idx}]`, message: "start and end must be HH:MM (24h)" });
      return;
    }
    result.push({ day, start, end });
  });
  return result;
}

function sanitizeCalendar(calendar, errors, opts = { partial: false }) {
  if (!calendar || typeof calendar !== "object") {
    return opts.partial ? undefined : {
      enabled: false,
      timezone: "UTC",
      slotDurationMinutes: 45
    };
  }
  const result = {};
  if (!opts.partial || calendar.enabled !== undefined) {
    result.enabled = coerceBoolean(calendar.enabled);
  }
  if (!opts.partial || calendar.timezone !== undefined) {
    const tz = sanitizeString(calendar.timezone) || "UTC";
    result.timezone = tz;
  }
  if (!opts.partial || calendar.slotDurationMinutes !== undefined) {
    const minutes = parsePositiveInt(calendar.slotDurationMinutes, 45);
    if (minutes < 5 || minutes > 480) {
      errors.push({ field: "calendar.slotDurationMinutes", message: "slotDurationMinutes must be between 5 and 480" });
      result.slotDurationMinutes = 45;
    } else {
      result.slotDurationMinutes = minutes;
    }
  }
  if (!opts.partial || calendar.workingHours !== undefined) {
    const sanitizedHours = sanitizeWorkingHours(calendar.workingHours, errors, opts);
    if (sanitizedHours !== undefined) {
      result.workingHours = sanitizedHours;
    }
  }
  return result;
}

function validateServices(services, errors, opts = { partial: false }) {
  if (!Array.isArray(services)) {
    if (opts.partial) return undefined;
    return [];
  }
  const sanitized = services.map((svc, idx) => {
    if (!svc || typeof svc !== "object") {
      errors.push({ field: `services[${idx}]`, message: "service must be an object" });
      return null;
    }
    const name = sanitizeString(svc.name);
    if (!name) {
      errors.push({ field: `services[${idx}].name`, message: "name is required" });
    }
    const currency = sanitizeString(svc.currency) || "USD";
    const minMinutes = parsePositiveInt(svc.minMinutes ?? svc.durationMinutes, 30);
    const maxMinutes = parsePositiveInt(svc.maxMinutes ?? svc.durationMinutes ?? svc.minMinutes, minMinutes);
    return {
      ...svc,
      id: sanitizeString(svc.id),
      name,
      currency,
      minMinutes,
      maxMinutes,
      price: Number.isFinite(Number(svc.price)) ? Number(svc.price) : 0,
      description: sanitizeString(svc.description),
      keywords: Array.isArray(svc.keywords)
        ? svc.keywords.map((kw) => sanitizeString(String(kw)))
        : sanitizeString(svc.keywords || "")
            .split(",")
            .map((kw) => kw.trim())
            .filter(Boolean)
    };
  }).filter(Boolean);
  return sanitized;
}

export function validateTenantCreate(payload = {}) {
  const errors = [];
  const displayName = sanitizeString(payload.displayName);
  const phoneNumberId = sanitizeString(payload.phoneNumberId);
  const graphVersion = sanitizeString(payload.graphVersion) || "v20.0";
  const wabaToken = sanitizeString(payload.wabaToken);

  if (!displayName) errors.push({ field: "displayName", message: "displayName is required" });
  if (!phoneNumberId) errors.push({ field: "phoneNumberId", message: "phoneNumberId is required" });
  if (!wabaToken) errors.push({ field: "wabaToken", message: "wabaToken is required" });

  const calendar = sanitizeCalendar(payload.calendar, errors, { partial: false });
  const services = validateServices(payload.services, errors, { partial: false });

  return {
    value: {
      displayName,
      phoneNumberId,
      graphVersion,
      wabaToken,
      calendar,
      services
    },
    errors
  };
}

export function validateTenantUpdate(payload = {}) {
  const errors = [];
  const value = {};

  if (payload.displayName !== undefined) {
    const displayName = sanitizeString(payload.displayName);
    if (!displayName) {
      errors.push({ field: "displayName", message: "displayName cannot be empty" });
    } else {
      value.displayName = displayName;
    }
  }

  if (payload.phoneNumberId !== undefined) {
    const phoneNumberId = sanitizeString(payload.phoneNumberId);
    if (!phoneNumberId) {
      errors.push({ field: "phoneNumberId", message: "phoneNumberId cannot be empty" });
    } else {
      value.phoneNumberId = phoneNumberId;
    }
  }

  if (payload.graphVersion !== undefined) {
    value.graphVersion = sanitizeString(payload.graphVersion) || "v20.0";
  }

  if (payload.calendar !== undefined) {
    const calendar = sanitizeCalendar(payload.calendar, errors, { partial: true });
    if (calendar) value.calendar = calendar;
  }

  if (payload.services !== undefined) {
    const services = validateServices(payload.services, errors, { partial: true });
    if (services !== undefined) value.services = services;
  }

  if (payload.metadata !== undefined) {
    value.metadata = payload.metadata;
  }

  if (payload.tags !== undefined) {
    value.tags = Array.isArray(payload.tags) ? payload.tags.map((tag) => sanitizeString(tag)) : [];
  }

  return { value, errors };
}

export function validateTokenRotation(payload = {}) {
  const errors = [];
  const token = sanitizeString(payload.token);
  if (!token) {
    errors.push({ field: "token", message: "token is required" });
  }
  return { value: { token }, errors };
}
