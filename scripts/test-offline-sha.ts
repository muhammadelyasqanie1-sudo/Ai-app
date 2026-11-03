import { createHash } from 'node:crypto';
import { Sha256 } from '../src/lib/offlineModelDownloads.ts';

const encoder = new TextEncoder();
const cases = [
  new Uint8Array(),
  encoder.encode('abc'),
  encoder.encode('AFG AI offline model integrity check'),
  Uint8Array.from({ length: 4097 }, (_, index) => (index * 37) & 255),
  Uint8Array.from({ length: 131071 }, (_, index) => (index * 19 + 7) & 255),
];

for (const input of cases) {
  const digest = new Sha256();
  for (let offset = 0; offset < input.length; offset += 137) digest.update(input.subarray(offset, offset + 137));
  const expected = createHash('sha256').update(input).digest('hex');
  const actual = digest.digest();
  if (actual !== expected) throw new Error(`SHA-256 mismatch: expected ${expected}, received ${actual}`);
}

process.stdout.write(`Offline SHA-256 tests passed (${cases.length} vectors).\n`);
