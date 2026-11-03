import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const VERSION = 'v1';
function masterKey(): Buffer {
  const raw = process.env.PROVIDER_KEYS_MASTER_KEY?.trim() || '';
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) throw new Error('PROVIDER_KEYS_MASTER_KEY must be a 32-byte key encoded as base64 or 64-character hex.');
  return key;
}

export function encryptProviderSecret(plaintext: string): string {
  if (!plaintext || plaintext.length > 8192) throw new Error('Provider key is empty or too large.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptProviderSecret(payload: string): string {
  const [version, ivText, tagText, dataText, extra] = String(payload || '').split('.');
  if (version !== VERSION || !ivText || !tagText || !dataText || extra) throw new Error('Stored provider key has an unsupported format.');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}

export function providerKeyHint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(-8);
}

export function redactSecret(value: unknown): string {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(?:sk-[A-Za-z0-9_-]{8,}|tvly-[A-Za-z0-9_-]{8,}|inf_[A-Za-z0-9_-]{8,})/g, '[REDACTED]')
    .replace(/([?&](?:api_key|key|token|secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 1200);
}
