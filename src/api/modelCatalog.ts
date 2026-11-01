export interface VerifiedModelCatalog {
  status: number;
  body: {
    error?: string;
    models: string[];
    source?: string;
    verified: boolean;
    checkedAt?: string;
  };
}

export async function getCloudflareModelCatalog(): Promise<VerifiedModelCatalog> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    return {
      status: 503,
      body: { error: 'AI model catalog is unavailable: provider credentials are not configured.', models: [], verified: false },
    };
  }

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=100&hide_experimental=true`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    const payload = await response.json() as {
      success?: boolean;
      result?: Array<{ name?: string; id?: string; model?: string; task?: { name?: string } | string }>;
    };

    if (!response.ok || payload.success !== true || !Array.isArray(payload.result)) {
      console.error('AI_MODEL_CATALOG_FAILED', JSON.stringify({ provider: 'cloudflare', status: response.status }));
      return {
        status: 502,
        body: { error: 'The AI provider could not verify its model catalog. Try again later.', models: [], verified: false },
      };
    }

    const models = payload.result
      .filter((item) => {
        const taskName = typeof item.task === 'string' ? item.task : item.task?.name;
        return Boolean(taskName && /text generation|text-generation|chat/i.test(taskName));
      })
      .map((item) => item.name || item.id || item.model || '')
      .filter((name): name is string => typeof name === 'string' && /^@cf\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(name))
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b));

    if (models.length === 0) {
      return {
        status: 503,
        body: { error: 'The provider returned no verified chat models for this account.', models: [], verified: false },
      };
    }

    return {
      status: 200,
      body: { models, source: 'cloudflare-live-catalog', verified: true, checkedAt: new Date().toISOString() },
    };
  } catch {
    console.error('AI_MODEL_CATALOG_ERROR', JSON.stringify({ provider: 'cloudflare' }));
    return {
      status: 502,
      body: { error: 'Could not contact the AI provider to verify models.', models: [], verified: false },
    };
  }
}
