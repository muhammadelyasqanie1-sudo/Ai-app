import { describe, expect, it } from 'vitest';
import { Sha256 } from '../src/lib/offlineModelDownloads';

describe('offline model download integrity', () => {
  it('calculates SHA-256 incrementally across multiple chunks', () => {
    const hash = new Sha256();
    hash.update(new TextEncoder().encode('a'));
    hash.update(new TextEncoder().encode('bc'));
    expect(hash.digest()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
