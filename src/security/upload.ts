import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  '.pdf': (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  '.png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
  '.jpg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.gif': (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')),
  '.webp': (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  '.txt': (b) => !b.subarray(0, Math.min(b.length, 4096)).includes(0),
  '.csv': (b) => !b.subarray(0, Math.min(b.length, 4096)).includes(0),
};

export type QuarantinedUpload = {
  id: string;
  quarantinePath: string;
  extension: string;
  size: number;
  status: 'quarantined';
};

/**
 * Stores a validated upload outside the public web root using a generated name.
 * Files remain quarantined and must not be served, parsed, or executed until a
 * separate malware/content scanner explicitly approves them.
 */
export async function quarantineUpload(input: {
  bytes: Buffer;
  originalName: string;
}): Promise<QuarantinedUpload> {
  const { bytes } = input;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error('Empty upload.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Upload exceeds the 15 MB limit.');

  const extension = path.extname(input.originalName || '').toLowerCase();
  const signatureCheck = SIGNATURES[extension];
  if (!signatureCheck || !signatureCheck(bytes)) {
    throw new Error('Unsupported file type or file signature mismatch.');
  }

  const configured = process.env.AFG_UPLOAD_QUARANTINE_DIR;
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error('AFG_UPLOAD_QUARANTINE_DIR must be an absolute private storage path.');
  }

  const directory = path.resolve(configured);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const quarantinePath = path.join(directory, id + extension);
  const handle = await open(quarantinePath, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(quarantinePath).catch(() => {});
    throw error;
  }
  await handle.close();

  return { id, quarantinePath, extension, size: bytes.length, status: 'quarantined' };
}
