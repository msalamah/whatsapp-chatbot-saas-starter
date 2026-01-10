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

  return true;
}

if (process.env.NODE_ENV !== "test") {
  validateEnv();
}
