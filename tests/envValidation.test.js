import { describe, it, expect } from "vitest";
import { validateEnv } from "../src/config/env.js";

describe("env validation", () => {
  it("throws when required env vars missing", () => {
    expect(() => validateEnv({})).toThrow(/Missing required environment variables/);
  });

  it("passes when required vars present", () => {
    const base = {
      DATABASE_URL: "postgres://test",
      WHATSAPP_VERIFY_TOKEN: "token",
      WABA_TOKEN: "waba",
      PHONE_NUMBER_ID: "123",
      ADMIN_API_KEYS: "abc,def",
      OWNER_JWT_SECRET: "secret"
    };
    expect(validateEnv(base)).toBe(true);
  });

  it("requires at least one admin token", () => {
    const base = {
      DATABASE_URL: "postgres://test",
      WHATSAPP_VERIFY_TOKEN: "token",
      WABA_TOKEN: "waba",
      PHONE_NUMBER_ID: "123",
      ADMIN_API_KEYS: "",
      OWNER_JWT_SECRET: "secret"
    };
    expect(() => validateEnv(base)).toThrow(/ADMIN_API_KEYS/);
  });
});
