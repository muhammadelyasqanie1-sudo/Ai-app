const LOCAL_BASE_URL = 'http://127.0.0.1:8080';
const REQUEST_TIMEOUT_MS = 5000;

export type DesktopLocalModel = { id: string };
export type DesktopLocalRuntimeInfo = {
  available: boolean;
  baseUrl: string;
  models: DesktopLocalModel[];
  reason?: string;
};

function localRequestUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error('Invalid local runtime path.');
  return LOCAL_BASE_URL + path;
}

/**
 * Connects only to a loopback llama.cpp server on this same computer.
 * The endpoint is intentionally fixed; callers cannot send prompts to an arbitrary URL.
 */
export async function getDesktopLocalRuntimeInfo(): Promise<DesktopLocalRuntimeInfo> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(localRequestUrl('/v1/models'), {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { available: false, baseUrl: LOCAL_BASE_URL, models: [], reason: 'Local llama.cpp server returned HTTP ' + response.status + '.' };
    }
    const payload = await response.json() as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(payload.data)
      ? payload.data.filter((item): item is { id: string } => typeof item?.id === 'string' && item.id.length > 0).map(item => ({ id: item.id }))
      : [];
    if (!models.length) {
      return { available: false, baseUrl: LOCAL_BASE_URL, models: [], reason: 'The local server is reachable but has no loaded model.' };
    }
    return { available: true, baseUrl: LOCAL_BASE_URL, models };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'The local llama.cpp server did not respond within five seconds.'
      : 'The local llama.cpp server is not reachable. Start it on 127.0.0.1:8080 and allow this AFG AI origin in its CORS settings.';
    return { available: false, baseUrl: LOCAL_BASE_URL, models: [], reason };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function generateDesktopLocalResponse(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 384,
): Promise<string> {
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    throw new Error('A local model and at least one message are required.');
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(localRequestUrl('/v1/chat/completions'), {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: Math.max(32, Math.min(1024, Math.floor(maxTokens))),
        stream: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error('Local model request failed (HTTP ' + response.status + '). ' + detail.slice(0, 240));
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('The local model returned an empty response.');
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Local inference timed out after three minutes.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
