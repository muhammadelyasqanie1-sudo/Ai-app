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
}).passthrough();
export type SharedChatRequest = z.infer<typeof ChatRequestSchema>;
export const ApiErrorSchema = z.object({
  error: z.string(),
  requestId: z.string().uuid().optional(),
  code: z.string().optional(),
});
export type ApiErrorPayload = z.infer<typeof ApiErrorSchema>;
