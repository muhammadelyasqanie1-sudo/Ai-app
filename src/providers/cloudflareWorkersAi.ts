import type { ChatInput, ChatProviderAdapter, ProviderCatalog, ProviderModel } from './providerTypes.ts';
import { ProviderAdapterError } from './providerTypes.ts';

type CloudflareModelRecord = {
  name?: string;
  id?: string;
  model?: string;
  task?: { name?: string } | string;
};

export const cloudflareWorkersAi: ChatProviderAdapter = {
  key: 'cloudflare-workers-ai',
  displayName: 'Cloudflare Workers AI',

  async listModels(): Promise<ProviderCatalog> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

    if (!accountId || !apiToken) {
      return {
        status: 503,
        verified: false,
        models: [],
        error: 'AI provider credentials are not configured on the server.',
      };
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=100&hide_experimental=true`,
        {
          headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(12_000),
        },
      );
      const payload = await response.json() as {
        success?: boolean;
        result?: CloudflareModelRecord[];
      };

      if (!response.ok || payload.success !== true || !Array.isArray(payload.result)) {
        console.error('AI_MODEL_CATALOG_FAILED', JSON.stringify({
          provider: this.key,
          status: response.status,
        }));
        return {
          status: 502,
          verified: false,
          models: [],
          error: 'The AI provider could not verify its model catalog. Try again later.',
        };
      }

      const models: ProviderModel[] = payload.result
        .filter((item) => {
          const taskName = typeof item.task === 'string' ? item.task : item.task?.name;
          return Boolean(taskName && /text generation|text-generation|chat/i.test(taskName));
        })
        .map((item) => item.name || item.id || item.model || '')
        .filter((id): id is string => /^@cf\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(id))
        .filter((id, index, all) => all.indexOf(id) === index)
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ id, displayName: id, capabilities: ['chat' as const] }));

      if (models.length === 0) {
        return {
          status: 503,
          verified: false,
          models: [],
          error: 'The provider returned no verified chat models for this account.',
        };
      }

      return {
        status: 200,
        verified: true,
        models,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      console.error('AI_MODEL_CATALOG_ERROR', JSON.stringify({ provider: this.key }));
      return {
        status: 502,
        verified: false,
        models: [],
        error: 'Could not contact the AI provider to verify models.',
      };
    }
  },

  async *streamChat(input: ChatInput): AsyncGenerator<string, void, void> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!accountId || !apiToken) {
      throw new ProviderAdapterError('AI provider is not configured.', 503, 'provider_not_configured');
    }

    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ model: input.model, messages: input.messages, stream: true }),
          signal: AbortSignal.timeout(90_000),
        },
      );
    } catch {
      throw new ProviderAdapterError('Could not contact the AI provider.', 502, 'provider_unreachable');
    }

    if (!response.ok) {
      console.error('AI_PROVIDER_REQUEST_FAILED', JSON.stringify({
        provider: this.key,
        status: response.status,
        model: input.model,
      }));
      throw new ProviderAdapterError(
        'The AI provider rejected the request. Check model access or try another verified model.',
        response.status >= 400 && response.status < 500 ? response.status : 502,
        'provider_request_rejected',
      );
    }
    if (!response.body) {
      throw new ProviderAdapterError('The AI provider returned an empty response stream.', 502, 'empty_provider_stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const parseEvent = (eventText: string): string | null => {
      const dataLine = eventText.split(/\r?\n/).find((line) => line.startsWith('data:'));
      if (!dataLine) return null;
      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') return null;

      let event: any;
      try {
        event = JSON.parse(data);
      } catch {
        return null;
      }
      if (event.error) {
        throw new ProviderAdapterError('The AI provider interrupted the response.', 502, 'provider_stream_error');
      }
      const piece =
        typeof event.response === 'string' ? event.response :
        typeof event.text === 'string' ? event.text :
        typeof event.choices?.[0]?.delta?.content === 'string' ? event.choices[0].delta.content :
        undefined;
      return typeof piece === 'string' && piece.length > 0 ? piece : null;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const eventText of events) {
          const piece = parseEvent(eventText);
          if (piece) yield piece;
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const piece = parseEvent(buffer);
        if (piece) yield piece;
      }
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      throw new ProviderAdapterError('The AI response stream was interrupted.', 502, 'provider_stream_interrupted');
    } finally {
      reader.releaseLock();
    }
  },
};
