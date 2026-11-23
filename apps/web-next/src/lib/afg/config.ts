import crypto from "node:crypto";

/**
 * AFG AI runtime configuration.
 * Secrets are read from environment only. Nothing here is ever sent to the client.
 */

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Resolve a 32-byte secret key from the environment.
 * In production a missing or too-short secret is a hard startup failure that
 * names the offending variable (the value itself is never printed).
 * Non-production deployments fall back to a derived key so local dev works.
 */
function secretKey(name: string): Buffer {
  const raw = process.env[name];
  if (IS_PROD && (!raw || raw.length < 32)) {
    throw new Error(
      `AFG AI configuration error: ${name} is missing or shorter than 32 characters. ` +
        `Set ${name} to at least 32 random characters before running in production.`
    );
  }
  if (raw && raw.length >= 32) {
    // Accept base64 or plain long strings
    const buf = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.endsWith("=")
      ? Buffer.from(raw, "base64")
      : Buffer.from(raw, "utf8");
    if (buf.length >= 32) return buf.subarray(0, 32);
  }
  if (IS_PROD) {
    throw new Error(
      `AFG AI configuration error: ${name} must encode at least 32 bytes of random data.`
    );
  }
  return crypto.createHash("sha256").update(raw || `afg-ai-dev-fallback::${name}`).digest();
}

// One-time policy warning: dev verification codes are never available in production.
if (process.env.AFG_ALLOW_DEV_CODES === "true" && IS_PROD) {
  console.warn(
    "[AFG AI] AFG_ALLOW_DEV_CODES is ignored in production; development verification codes are hard-disabled."
  );
}

export const config = {
  productName: "AFG AI",
  tagline: "One AI. Many capabilities. One intelligent platform.",
  sessionSecret: secretKey("AFG_SESSION_SECRET"),
  vaultKey: secretKey("AFG_VAULT_KEY"),
  sessionTtlDays: 30,
  isProd: IS_PROD,
  /**
   * Development code delivery: when no email provider (RESEND_API_KEY) is
   * configured, verification/reset codes can be returned in the API response
   * so the flow is testable. Hard-disabled in production regardless of the
   * environment flag.
   */
  allowDevCodes: process.env.AFG_ALLOW_DEV_CODES === "true" && !IS_PROD && !process.env.RESEND_API_KEY,
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    from: process.env.EMAIL_FROM || "AFG AI <no-reply@afg-ai.local>",
  },
  googleOAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
  appOrigin: process.env.APP_ORIGIN || "",
  providers: {
    ninerouterBaseUrl: process.env.NINEROUTER_BASE_URL || "",
    ninerouterApiKey: process.env.NINEROUTER_API_KEY || "",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "",
    openaiCompatBaseUrl: process.env.OPENAI_COMPAT_BASE_URL || "",
    openaiCompatApiKey: process.env.OPENAI_COMPAT_API_KEY || "",
    openaiCompatName: process.env.OPENAI_COMPAT_DISPLAY_NAME || "",
  },
  uploads: {
    dir: process.env.AFG_UPLOAD_DIR || "db/uploads",
    maxBytes: 15 * 1024 * 1024, // 15 MB
  },
  limits: {
    authPerHour: 20,
    chatPerHour: 60,
    toolPerHour: 40,
    uploadPerHour: 30,
    guestChatPerHour: 15,
  },
  unknownContextBudget: Number(process.env.AFG_UNKNOWN_CONTEXT_BUDGET || 8192),
} as const;

export const STAFF_PERMISSIONS = [
  "users.read",
  "users.write",
  "providers.read",
  "providers.write",
  "models.write",
  "usage.read",
  "errors.read",
  "audit.read",
  "flags.write",
  "announcements.write",
  "settings.write",
  "health.read",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
