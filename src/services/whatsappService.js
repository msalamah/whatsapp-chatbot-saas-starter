import fetch from "node-fetch";
import { getTenantByKey } from "../tenants/tenantManager.js";

async function resolveTenant(tenantKey) {
  const tenant = await getTenantByKey(tenantKey);
  if (tenant) return tenant;
  if (tenantKey !== "default") {
    return await getTenantByKey("default");
  }
  return null;
}

export async function sendMessage(tenantKey, payload) {
  const tenant = await resolveTenant(tenantKey);
  if (!tenant) throw new Error("Tenant not found for messaging");
  const GRAPH_VERSION = tenant.graphVersion || "v20.0";
  const PHONE_NUMBER_ID = tenant.phoneNumberId || process.env.PHONE_NUMBER_ID;
  const WABA_TOKEN = tenant.wabaToken || process.env.WABA_TOKEN;

  if (!PHONE_NUMBER_ID || !WABA_TOKEN) {
    throw new Error("Missing WhatsApp credentials");
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${WABA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Send error:", data);
    throw new Error(JSON.stringify(data));
  }
  return data;
}

export async function sendText(tenantKey, to, body) {
  return sendMessage(tenantKey, { to, type: "text", text: { body } });
}

export async function sendButtons(tenantKey, to, question, buttons) {
  return sendMessage(tenantKey, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: question },
      action: {
        buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } }))
      }
    }
  });
}
