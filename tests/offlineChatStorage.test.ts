import { beforeEach, describe, expect, it } from 'vitest';
import { clearOfflineChatMessages, loadOfflineChatMessages, saveOfflineChatMessages } from '../src/lib/offlineChatStorage';

describe('offline chat storage', () => {
  beforeEach(async () => { await clearOfflineChatMessages('test-model'); });

  it('persists and restores a model-specific conversation', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hello offline' },
      { role: 'assistant' as const, content: 'Local response' },
    ];
    await saveOfflineChatMessages('test-model', messages);
    await expect(loadOfflineChatMessages('test-model')).resolves.toEqual(messages);
  });

  it('clears only the requested model conversation', async () => {
    await saveOfflineChatMessages('test-model', [{ role: 'user', content: 'A' }]);
    await saveOfflineChatMessages('other-model', [{ role: 'user', content: 'B' }]);
    await clearOfflineChatMessages('test-model');
    await expect(loadOfflineChatMessages('test-model')).resolves.toEqual([]);
    await expect(loadOfflineChatMessages('other-model')).resolves.toEqual([{ role: 'user', content: 'B' }]);
  });
});
