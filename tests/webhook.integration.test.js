import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

vi.mock("../src/services/bookingService.js", () => ({
  handleIncomingChange: vi.fn(async () => {})
}));

import { handleIncomingChange } from "../src/services/bookingService.js";
import { createApp } from "../src/app.js";
import { httpRequest } from "./helpers/httpClient.js";

describe("/webhook integration", () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = "token";
    process.env.APP_SECRET = "secret";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.APP_SECRET;
  });

  it("returns challenge for GET verification", async () => {
    const app = createApp();
    const res = await httpRequest(app, { path: "/webhook?hub.mode=subscribe&hub.verify_token=token&hub.challenge=abc" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("abc");
  });

  it("rejects invalid signature", async () => {
    const app = createApp();
    const res = await httpRequest(app, {
      method: "POST",
      path: "/webhook",
      body: { object: "whatsapp_business_account" }
    });
    expect(res.status).toBe(403);
    expect(handleIncomingChange).not.toHaveBeenCalled();
  });

  it("processes change events when signature valid", async () => {
    const app = createApp();
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry1",
          changes: [{ field: "messages", value: { metadata: { phone_number_id: "123" } } }]
        }
      ]
    };
    const raw = JSON.stringify(payload);
    const signature = "sha256=" + crypto.createHmac("sha256", process.env.APP_SECRET).update(raw).digest("hex");

    const res = await httpRequest(app, {
      method: "POST",
      path: "/webhook",
      headers: { "x-hub-signature-256": signature },
      body: payload
    });
    expect(res.status).toBe(200);

    expect(handleIncomingChange).toHaveBeenCalledTimes(1);
    expect(handleIncomingChange).toHaveBeenCalledWith(payload.entry[0].changes[0]);
  });
});
