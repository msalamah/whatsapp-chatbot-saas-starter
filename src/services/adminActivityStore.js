import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const ACTIVITY_FILE = path.join(DATA_DIR, "admin-activity.json");
const DEFAULT_LIMIT = 100;

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACTIVITY_FILE)) {
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify([]));
  }
}

function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(ACTIVITY_FILE, "utf-8");
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function writeAll(events) {
  ensureStore();
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(events, null, 2));
}

export function appendActivity(event) {
  if (!event) return;
  const events = readAll();
  events.unshift({
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  });
  if (events.length > 500) {
    events.length = 500;
  }
  writeAll(events);
  return event;
}

export function listActivities({ limit = DEFAULT_LIMIT } = {}) {
  const events = readAll();
  return events.slice(0, limit);
}
