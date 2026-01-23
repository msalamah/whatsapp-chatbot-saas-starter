const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "WHATSAPP_VERIFY_TOKEN",
  "WABA_TOKEN",
  "PHONE_NUMBER_ID",
  "ADMIN_API_KEYS",
  "OWNER_JWT_SECRET"
];

export function validateEnv(env = process.env) {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name] || String(env[name]).trim() === "");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const adminKeys = env.ADMIN_API_KEYS?.split(",").map((v) => v.trim()).filter(Boolean) || [];
  if (!adminKeys.length) {
    throw new Error("ADMIN_API_KEYS must contain at least one token.");
  }

  const isProduction = env.NODE_ENV === "production";
  if (isProduction) {
    const otpSecret = env.OWNER_OTP_SECRET;
    if (!otpSecret || String(otpSecret).trim() === "") {
      throw new Error("OWNER_OTP_SECRET is required in production.");
    }
    const refreshSecret = env.OWNER_REFRESH_SECRET;
    if (!refreshSecret || String(refreshSecret).trim() === "") {
      throw new Error("OWNER_REFRESH_SECRET is required in production.");
    }
    const smsVars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"];
    const smsMissing = smsVars.filter((name) => !env[name] || String(env[name]).trim() === "");
    if (smsMissing.length) {
      throw new Error(`Missing required SMS env vars in production: ${smsMissing.join(", ")}`);
    }
  }

  return true;
}

if (process.env.NODE_ENV !== "test") {
  validateEnv();
}
