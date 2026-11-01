import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { getProviderAdapter, getVerifiedModelDescriptors } from '../services/providerGateway.ts';
import { authenticateRequest } from './auth.ts';
import { pool } from './database.ts';
import { verifyCsrf } from './auth.ts';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_CONCURRENT_VOICE_REQUESTS = 2;
let activeVoiceRequests = 0;
const voiceRate = new Map<string,{startedAt:number;count:number}>();
const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac']);

function reply(res: ServerResponse, status: number, payload: unknown, requestId: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
  res.end(JSON.stringify({ ...(payload as object), requestId }));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > 14 * 1024 * 1024) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_body');
  return parsed as Record<string, unknown>;
}

export async function handleVoiceApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (path !== '/api/voice/transcribe' && path !== '/api/voice/synthesize' && path !== '/api/voice/voices') return false;
  const requestId = randomUUID();
  const user = await authenticateRequest(req);
  if (!user) { reply(res,401,{available:false,error:'Sign in is required to use Voice features.'},requestId); return true; }
  if (!['GET','HEAD','OPTIONS'].includes(req.method || 'GET') && !verifyCsrf(req)) { reply(res,403,{available:false,error:'CSRF validation failed.'},requestId); return true; }
  if (user && pool) {
    const preference = await pool.query('SELECT COALESCE(p.voice_enabled,true) AS voice_enabled FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id WHERE u.id=$1',[user.id]);
    if (preference.rows[0]?.voice_enabled === false) { reply(res,403,{available:false,error:'Voice features are disabled in your account settings.'},requestId); return true; }
  }
  if (path === '/api/voice/voices' && req.method === 'GET') {
    const descriptors = await getVerifiedModelDescriptors();
    const voiceModel = descriptors.find((model) => model.enabled && model.verifiedAt && model.capabilities.tts && Boolean(getProviderAdapter(model.providerId)?.synthesize));
    const voices = voiceModel ? getProviderAdapter(voiceModel.providerId)?.voiceOptions?.(voiceModel.id) || [] : [];
    reply(res, 200, { available: voices.length > 0, voices }, requestId);
    return true;
  }
  if (req.method !== 'POST') {
    reply(res, 405, { error: 'Method not allowed.' }, requestId);
    return true;
  }
  const clientKey = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rate = voiceRate.get(clientKey);
  if (!rate || now - rate.startedAt >= 60_000) voiceRate.set(clientKey,{startedAt:now,count:1});
  else if (rate.count >= 8) { reply(res,429,{error:'Voice rate limit reached. Please wait before trying again.'},requestId); return true; }
  else rate.count += 1;
  if (voiceRate.size > 500) for (const [key,value] of voiceRate) if (now-value.startedAt>=60_000) voiceRate.delete(key);
  if (activeVoiceRequests >= MAX_CONCURRENT_VOICE_REQUESTS) { reply(res,503,{error:'Voice processing is busy. Please retry shortly.'},requestId); return true; }
  activeVoiceRequests += 1;
  try {
    const body = await readBody(req);
    if (path.endsWith('/transcribe')) {
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase().split(';')[0].trim() : '';
      const encoded = typeof body.audioBase64 === 'string' ? body.audioBase64 : '';
      if (!ALLOWED_AUDIO_TYPES.has(mimeType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        reply(res, 400, { error: 'Provide supported audio data and MIME type.' }, requestId);
        return true;
      }
      const audio = Buffer.from(encoded, 'base64');
      if (!audio.length || audio.length > MAX_AUDIO_BYTES) {
        reply(res, 413, { error: 'Audio must be between 1 byte and 10 MB.' }, requestId);
        return true;
      }
      const descriptors = await getVerifiedModelDescriptors();
      const selectedModel = descriptors.find((model) => model.enabled && model.verifiedAt && model.capabilities.stt && Boolean(getProviderAdapter(model.providerId)?.transcribe));
      if (!selectedModel) {
        reply(res, 503, { available: false, error: 'No verified speech-to-text provider is available.' }, requestId);
        return true;
      }
      const modelId = selectedModel.id;
      const adapter = getProviderAdapter(selectedModel.providerId);
      if (!adapter?.transcribe) {
        reply(res, 503, { available: false, error: 'The selected provider does not implement speech recognition.' }, requestId);
        return true;
      }
      const language = ['auto', 'en', 'fa', 'ps', 'ar'].includes(String(body.language)) ? String(body.language) : 'auto';
      const result = await adapter.transcribe({ audio: new Uint8Array(audio), mimeType, language });
      reply(res, 200, { available: true, text: result.text }, requestId);
      return true;
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const voice = typeof body.voice === 'string' ? body.voice.trim().slice(0, 100) : undefined;
    if (!text || text.length > 5000) {
      reply(res, 400, { error: 'Text-to-speech input must contain 1 to 5,000 characters.' }, requestId);
      return true;
    }
    const descriptors = await getVerifiedModelDescriptors();
    const selectedModel = descriptors.find((model) => model.enabled && model.verifiedAt && model.capabilities.tts && Boolean(getProviderAdapter(model.providerId)?.synthesize));
    if (!selectedModel) {
      reply(res, 503, { available: false, error: 'No verified text-to-speech provider is available.' }, requestId);
      return true;
    }
    const adapter = getProviderAdapter(selectedModel.providerId);
    if (!adapter?.synthesize) {
      reply(res, 503, { available: false, error: 'The selected provider does not implement speech synthesis.' }, requestId);
      return true;
    }
    const language = ['en', 'fa', 'ps', 'ar'].includes(String(body.language)) ? String(body.language) : undefined;
    const result = await adapter.synthesize({ text, voice, language });
    if (!result.audio.length || result.audio.length > MAX_AUDIO_BYTES) {
      reply(res, 502, { error: 'The voice provider returned an invalid audio result.' }, requestId);
      return true;
    }
    reply(res, 200, { available: true, mimeType: result.mimeType, audioBase64: Buffer.from(result.audio).toString('base64') }, requestId);
    return true;
  } catch (error) {
    const message = error instanceof Error && error.message === 'body_too_large'
      ? 'Voice request is too large.'
      : 'Voice processing failed. Please retry.';
    reply(res, error instanceof Error && error.message === 'body_too_large' ? 413 : 502, { error: message }, requestId);
    return true;
  } finally {
    activeVoiceRequests = Math.max(0, activeVoiceRequests - 1);
  }
}
