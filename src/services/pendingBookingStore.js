import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const PENDING_FILE = path.join(DATA_DIR, "pending-bookings.json");
let cache = null;

function ensureStoreLoaded() {
  if (cache) return cache;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(PENDING_FILE)) {
      cache = {};
      persist();
    } else {
      const raw = fs.readFileSync(PENDING_FILE, "utf-8");
      cache = raw ? JSON.parse(raw) : {};
    }
  } catch (err) {
    console.error("Failed to load pending bookings store:", err);
    cache = {};
  }
  return cache;
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PENDING_FILE, JSON.stringify(cache || {}, null, 2));
}

export function savePendingBooking(customerId, payload) {
  if (!customerId) throw new Error("customerId is required to save pending booking");
  const store = ensureStoreLoaded();
  store[customerId] = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  persist();
  return store[customerId];
}

export function getPendingBooking(customerId) {
  const store = ensureStoreLoaded();
  return store[customerId] || null;
}

export function deletePendingBooking(customerId) {
  const store = ensureStoreLoaded();
  if (store[customerId]) {
    delete store[customerId];
    persist();
  }
}

export function listPendingBookings() {
  return ensureStoreLoaded();
}
