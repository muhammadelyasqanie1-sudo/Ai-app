import { z } from 'zod';

export const PackManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,80}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/),
  subjects: z.array(z.enum(['english','mathematics','physics','chemistry','biology','general-science','history','geography','computer-science'])).min(1),
  languages: z.array(z.enum(['en','fa','ps','ar'])).min(1),
  runtime: z.enum(['webllm','llama-cpp-wasm','ollama-desktop']),
  model: z.object({
    id: z.string().min(1).max(160),
    file: z.string().min(1).max(240).refine(value=>!value.startsWith('/') && !value.includes('..') && !value.includes('\\')),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    size_bytes: z.number().int().positive().max(50_000_000_000),
    quantization: z.string().min(1).max(40),
    min_ram_mb: z.number().int().positive().max(1_000_000),
    license: z.string().min(1).max(160)
  }).strict(),
  publisher: z.string().min(2).max(160),
  published_at: z.string().datetime(),
  lessons: z.array(z.object({
    id: z.string().min(1).max(120),
    file: z.string().min(1).max(240).refine(value=>!value.startsWith('/') && !value.includes('..') && !value.includes('\\')),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i)
  }).strict()).min(1)
}).strict();

export type PackManifest = z.infer<typeof PackManifestSchema>;
