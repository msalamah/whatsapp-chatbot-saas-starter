import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { verifyWebhook, verifySignature } from "../src/utils/verifySignature.js";

describe("verifyWebhook", () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = "token123";
  });

  it("accepts valid verification challenge", () => {
    const req = { query: { "hub.mode": "subscribe", "hub.verify_token": "token123", "hub.challenge": "xyz" } };
    const result = verifyWebhook(req);
    expect(result).toEqual({ ok: true, challenge: "xyz" });
  });

  it("rejects invalid token", () => {
    const req = { query: { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "xyz" } };
    const result = verifyWebhook(req);
    expect(result.ok).toBe(false);
  });
});

describe("verifySignature", () => {
  beforeEach(() => {
    process.env.APP_SECRET = "app_secret";
  });

  it("returns true for matching signature", () => {
    const payload = JSON.stringify({ foo: "bar" });
    const hmac = crypto.createHmac("sha256", process.env.APP_SECRET);
    hmac.update(payload);
    const signature = "sha256=" + hmac.digest("hex");

    const req = {
      headers: { "x-hub-signature-256": signature },
      rawBody: payload
    };

    expect(verifySignature(req)).toBe(true);
  });

  it("returns false for mismatched signature", () => {
    const req = {
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      rawBody: "{}"
    };

    expect(verifySignature(req)).toBe(false);
  });

  it("skips verification when secret missing", () => {
    process.env.APP_SECRET = "";
    const req = {
      headers: {},
      rawBody: "anything"
    };
    expect(verifySignature(req)).toBe(true);
  });
});
