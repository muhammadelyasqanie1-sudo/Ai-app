import crypto from "node:crypto";

/**
 * AFG AI runtime configuration.
 * Secrets are read from environment only. Nothing here is ever sent to the client.
 */

function b32key(name: string): Buffer {
  const raw = process.env[name];
  if (raw && raw.length >= 32) {
    // Accept base64 or plain long strings
    const buf = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.endsWith("=")
      ? Buffer.from(raw, "base64")
      : Buffer.from(raw, "utf8");
    if (buf.length >= 32) return buf.subarray(0, 32);
  }
  return crypto.createHash("sha256").update(raw || `afg-ai-dev-fallback::${name}`).digest();
}

export const config = {
  productName: "AFG AI",
  tagline: "One AI. Many capabilities. One intelligent platform.",
  sessionSecret: b32key("AFG_SESSION_SECRET"),
  vaultKey: b32key("AFG_VAULT_KEY"),
  sessionTtlDays: 30,
  isProd: process.env.NODE_ENV === "production",
  /**
   * Development code delivery: when no email provider (RESEND_API_KEY) is
   * configured, verification/reset codes can be returned in the API response
   * so the flow is testable. Must stay false in production deployments.
   */
  allowDevCodes: process.env.AFG_ALLOW_DEV_CODES === "true" && !process.env.RESEND_API_KEY,
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
