import { describe, it, expect } from "vitest";
import { validateTenantCreate, validateTenantUpdate, validateTokenRotation } from "../src/tenants/tenantValidation.js";

describe("validateTenantCreate", () => {
  it("returns normalized payload when valid", () => {
    const { value, errors } = validateTenantCreate({
      displayName: "New Biz ",
      phoneNumberId: "12345",
      wabaToken: "token",
      services: [
        { name: "Service", minMinutes: 20, price: 10, keywords: "quick" }
      ],
      calendar: {
        enabled: true,
        timezone: "Europe/Berlin",
        slotDurationMinutes: 20,
        workingHours: [{ day: 1, start: "09:00", end: "11:00" }]
      }
    });
    expect(errors).toHaveLength(0);
    expect(value.displayName).toBe("New Biz");
    expect(value.services[0].keywords).toContain("quick");
    expect(value.calendar.enabled).toBe(true);
  });

  it("collects errors for missing required fields", () => {
    const { errors } = validateTenantCreate({});
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("displayName");
    expect(fields).toContain("phoneNumberId");
    expect(fields).toContain("wabaToken");
  });
});

describe("validateTenantUpdate", () => {
  it("flags empty string updates", () => {
    const { errors } = validateTenantUpdate({ displayName: "" });
    expect(errors.some((err) => err.field === "displayName")).toBe(true);
  });

  it("sanitizes services when provided", () => {
    const { value, errors } = validateTenantUpdate({
      services: [
        { id: "svc", name: "Trim", minMinutes: 15, maxMinutes: 30, keywords: ["trim", "cut"] }
      ]
    });
    expect(errors).toHaveLength(0);
    expect(value.services[0].minMinutes).toBe(15);
  });
});

describe("validateTokenRotation", () => {
  it("requires token", () => {
    const { errors } = validateTokenRotation({ token: "" });
    expect(errors[0].field).toBe("token");
  });

  it("accepts non-empty token", () => {
    const { value, errors } = validateTokenRotation({ token: "newtoken" });
    expect(errors).toHaveLength(0);
    expect(value.token).toBe("newtoken");
  });
});
