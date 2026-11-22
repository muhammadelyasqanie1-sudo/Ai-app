import { z } from 'zod';
import { isModelId } from './modelIds';

export const LocaleSchema = z.enum(['dari','english','pashto','persian','arabic','urdu','turkish','russian','french','spanish','german','chinese','hindi','bengali','indonesian','portuguese','japanese','korean']);
export const ChatMessageSchema = z.object({
  role: z.enum(['user','assistant']),
  content: z.string().max(50_000),
}).passthrough();
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(100),
  model: z.string().trim().min(1).max(300).refine(isModelId,'Invalid model identifier'),
  language: LocaleSchema.optional(),
  no_fallback: z.boolean().optional(),
  token_saver: z.boolean().optional(),
  context_compression: z.boolean().optional(),
  // Optional server-side persistence contract (authenticated users only).
  // When conversationId is supplied and owned by the caller, the server stores
  // the final user message and the streamed assistant reply itself, so a
  // disconnected client no longer loses the response.
  conversationId: z.string().uuid().optional(),
  clientMessageId: z.string().uuid().optional(),
  assistantClientMessageId: z.string().uuid().optional(),
}).passthrough();
export type SharedChatRequest = z.infer<typeof ChatRequestSchema>;
export const ApiErrorSchema = z.object({
  error: z.string(),
  requestId: z.string().uuid().optional(),
  code: z.string().optional(),
});
export type ApiErrorPayload = z.infer<typeof ApiErrorSchema>;
