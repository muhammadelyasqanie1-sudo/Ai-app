import { z } from "zod";
export const mediaTypes = [
  "text",
  "image_generate",
  "image_edit",
  "image_understand",
  "video_generate",
  "video_analyze",
  "speech_recognize",
  "speech_generate",
  "audio_understand",
  "document_analyze",
  "document_extract",
  "ocr",
] as const;
export type MediaType = (typeof mediaTypes)[number];
export const mediaRequest = z
  .object({
    type: z.enum(mediaTypes),
    provider: z.string().min(1).max(100).optional(),
    model: z.string().min(1).max(300).optional(),
    prompt: z.string().trim().max(4000).default(""),
    inputFileIds: z.array(z.uuid()).max(2).default([]),
    parameters: z
      .object({
        voice: z.string().trim().min(1).max(100).optional(),
        language: z
          .string()
          .regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)
          .optional(),
      })
      .strict()
      .default({}),
    requestKey: z.uuid(),
    allowExternalProcessing: z.boolean().default(false),
  })
  .strict();
export type MediaRequest = z.infer<typeof mediaRequest>;
export type MediaInput = { bytes: Buffer; mime: string; name: string };
export type MediaOutput = {
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
  metadata?: Record<string, unknown>;
  usage?: Record<string, unknown>;
};
export const localTypes: MediaType[] = ["document_extract", "video_analyze"];
