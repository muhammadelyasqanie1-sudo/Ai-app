import { z } from "zod";

/** Shared request validation schemas. */

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const guestSchema = z.object({ name: z.string().max(80).optional() });

export const codeRequestSchema = z.object({ email: z.string().email().max(320) });

export const codeConfirmSchema = z.object({
  email: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(12).max(128).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  locale: z.enum(["en", "fa", "ps", "ar"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  voiceEnabled: z.boolean().optional(),
  voiceRate: z.number().min(0.5).max(2).optional(),
  voicePitch: z.number().min(0.5).max(2).optional(),
  memoryEnabled: z.boolean().optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
});

export const conversationCreateSchema = z.object({
  title: z.string().max(120).optional(),
  modelSlug: z.string().max(160).optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
});

export const conversationUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  archived: z.boolean().optional(),
  modelSlug: z.string().max(160).optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
  share: z.enum(["enable", "disable"]).optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().max(32000).optional(),
  attachmentIds: z.array(z.string()).max(6).optional(),
  modelSlug: z.string().max(160).optional(),
  regenerate: z.boolean().optional(),
  resendMessageId: z.string().optional(),
  webSearch: z.boolean().optional(),
  toolsEnabled: z.boolean().optional(),
  allowFallback: z.boolean().optional().default(true),
});

export const toolRunSchema = z.object({
  tool: z.enum(["web_search", "page_reader", "math", "data_analysis"]),
  args: z.record(z.string(), z.unknown()),
});

export const providerCreateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,48}$/),
  name: z.string().min(1).max(80),
  kind: z.enum(["openai-compatible", "ollama"]),
  baseUrl: z.string().url().max(400),
  apiKey: z.string().max(400).optional(),
});

export const providerUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  baseUrl: z.string().url().max(400).optional(),
  apiKey: z.string().max(400).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const adminUserUpdateSchema = z.object({
  role: z.enum(["USER", "STAFF", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  permissions: z.array(z.string()).optional(),
  name: z.string().max(80).optional(),
});

/** PATCH /api/admin/models/[id] body. */
export const adminModelUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  displayName: z.string().min(1).max(120).optional(),
  capabilities: z.array(z.enum(["chat", "coding", "vision", "reasoning", "tools"])).max(10).optional(),
  contextWindow: z.number().int().min(512).max(2_000_000).optional(),
});

export const flagUpdateSchema = z.object({ enabled: z.boolean() });

export const announcementSchema = z.object({
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(4000),
  level: z.enum(["info", "warning", "critical"]).default("info"),
  active: z.boolean().default(true),
});

/** Formats a zod error into a client-safe message. */
export function formatZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
