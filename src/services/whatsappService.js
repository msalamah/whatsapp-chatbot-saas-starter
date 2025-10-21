import fetch from "node-fetch";
import { loadTenants } from "../tenants/tenantManager.js";

export async function sendMessage(tenantKey, payload) {
  const tenants = loadTenants();
  const t = tenants[tenantKey] || tenants.default;
  const GRAPH_VERSION = t.graphVersion || "v20.0";
  const PHONE_NUMBER_ID = t.phoneNumberId || process.env.PHONE_NUMBER_ID;
  const WABA_TOKEN = t.wabaToken || process.env.WABA_TOKEN;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WABA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
  });
  const data = await res.json();
  if (!res.ok) { console.error("Send error:", data); throw new Error(JSON.stringify(data)); }
  return data;
}

export async function sendText(tenantKey, to, body) { return sendMessage(tenantKey, { to, type: "text", text: { body } }); }

export async function sendButtons(tenantKey, to, question, buttons) {
  return sendMessage(tenantKey, {
    to, type: "interactive",
    interactive: { type: "button", body: { text: question },
      action: { buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } })) } }
  });
}
