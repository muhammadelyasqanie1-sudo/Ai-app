import { pool } from '../api/database.ts';
import { hashContent } from './knowledgeEngine.ts';

/**
 * Optional, provider-agnostic embedding support.
 *
 * AFG AI does not require Gemini or any specific vendor. If an
 * OpenAI-compatible embeddings endpoint is configured with all three
 * AFG_KNOWLEDGE_EMBEDDING_* variables, the knowledge engine stores document
 * vectors and uses them to rerank full-text candidates. Otherwise retrieval
 * stays pure PostgreSQL full-text search and the status reports vectorSearch
 * as false. No fake or locally hashed "embeddings" are produced.
 */

type EmbeddingConfig = { baseUrl: string; apiKey: string; model: string };

const QUERY_CACHE_LIMIT = 64;
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const queryCache = new Map<string, { vector: number[]; at: number }>();

function readConfig(): EmbeddingConfig | null {
  const baseUrl = process.env.AFG_KNOWLEDGE_EMBEDDING_BASE_URL?.trim() || '';
  const apiKey = process.env.AFG_KNOWLEDGE_EMBEDDING_API_KEY?.trim() || '';
  const model = process.env.AFG_KNOWLEDGE_EMBEDDING_MODEL?.trim() || '';
  if (!baseUrl || !apiKey || !model) return null;
  try {
    const parsed = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return null;
    if (parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model };
}

export function getEmbeddingStatus() {
  const config = readConfig();
  return {
    configured: Boolean(config),
    model: config ? config.model.slice(0, 120) : null,
    provider: config ? 'openai-compatible' : null,
  };
}

function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 16 && value.length <= 8192 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

export async function embedText(text: string): Promise<number[] | null> {
  const config = readConfig();
  if (!config) return null;
  const input = String(text || '').trim().slice(0, 6000);
  if (!input) return null;
  const cacheKey = hashContent(config.model + '\n' + input);
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < QUERY_CACHE_TTL_MS) return cached.vector;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(config.baseUrl + '/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify({ model: config.model, input }),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      console.warn('AFG_KNOWLEDGE_EMBEDDING_HTTP_FAILED', JSON.stringify({ status: response.status }));
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = await response.json() as { data?: Array<{ embedding?: unknown }> };
    const vector = data?.data?.[0]?.embedding;
    if (!validVector(vector)) {
      console.warn('AFG_KNOWLEDGE_EMBEDDING_INVALID_RESPONSE');
      return null;
    }
    if (queryCache.size >= QUERY_CACHE_LIMIT) {
      const oldest = queryCache.keys().next().value;
      if (oldest) queryCache.delete(oldest);
    }
    queryCache.set(cacheKey, { vector, at: Date.now() });
    return vector;
  } catch (error) {
    console.warn('AFG_KNOWLEDGE_EMBEDDING_FAILED', JSON.stringify({
      reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request_failed',
    }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Store an embedding if configured. Failures never block saving the document. */
export async function embedDocumentIfConfigured(documentId: string, text: string): Promise<boolean> {
  if (!pool || !readConfig()) return false;
  try {
    const vector = await embedText(text);
    if (!vector) return false;
    await pool.query(
      'UPDATE knowledge_documents SET embedding=$2::jsonb,embedding_model=$3,embedding_updated_at=now() WHERE id=$1',
      [documentId, JSON.stringify(vector), readConfig()?.model || 'unknown'],
    );
    return true;
  } catch {
    console.warn('AFG_KNOWLEDGE_EMBEDDING_STORE_FAILED');
    return false;
  }
}
