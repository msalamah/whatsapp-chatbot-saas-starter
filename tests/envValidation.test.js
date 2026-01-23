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

  it("requires OTP secrets and SMS config in production", () => {
    const base = {
      DATABASE_URL: "postgres://test",
      WHATSAPP_VERIFY_TOKEN: "token",
      WABA_TOKEN: "waba",
      PHONE_NUMBER_ID: "123",
      ADMIN_API_KEYS: "abc",
      OWNER_JWT_SECRET: "secret",
      NODE_ENV: "production"
    };
    expect(() => validateEnv(base)).toThrow(/OWNER_OTP_SECRET/);
    expect(() => validateEnv({
      ...base,
      OWNER_OTP_SECRET: "otp",
      OWNER_REFRESH_SECRET: "refresh"
    })).toThrow(/SMS env vars/);
    expect(validateEnv({
      ...base,
      OWNER_OTP_SECRET: "otp",
      OWNER_REFRESH_SECRET: "refresh",
      TWILIO_ACCOUNT_SID: "sid",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_PHONE_NUMBER: "+15555550111"
    })).toBe(true);
  });
});
