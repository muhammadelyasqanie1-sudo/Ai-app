import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENVELOPE_VERSION = 'v1';
const KEY_ENV = 'AFG_PROVIDER_SECRET_ENCRYPTION_KEY';

function encryptionKey(): Buffer {
  const encoded = process.env[KEY_ENV]?.trim() || '';
  if (!encoded) throw new Error(KEY_ENV + ' is required before custom provider credentials can be stored.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error(KEY_ENV + ' must be a base64-encoded 32-byte key.');
  return key;
}

export function encryptProviderConfig(value: Record<string, unknown>, context = ''): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptProviderConfig(envelope: string, context = ''): Record<string, unknown> {
  const [version, ivText, tagText, ciphertextText, extra] = envelope.split('.');
  if (version !== ENVELOPE_VERSION || !ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new Error('Stored provider configuration has an unsupported encryption envelope.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored provider configuration is invalid.');
  }
  return parsed as Record<string, unknown>;
}
