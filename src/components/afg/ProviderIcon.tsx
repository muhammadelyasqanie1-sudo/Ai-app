import React from 'react';

const BRAND_SLUGS: Record<string, string> = {
  anthropic: 'anthropic', claude: 'anthropic',
  openai: 'openai', gpt: 'openai',
  google: 'googlegemini', gemini: 'googlegemini',
  minimax: 'minimax', deepseek: 'deepseek',
  mistral: 'mistral', qwen: 'alibabacloud',
  moonshot: 'moonshot', kimi: 'moonshot',
  xai: 'x', groq: 'groq', meta: 'meta',
  cohere: 'cohere', perplexity: 'perplexity',
};

export function ProviderIcon({ provider, model }: { provider: string; model?: string }) {
  const source = (provider + ' ' + (model || '')).toLowerCase();
  const key = Object.keys(BRAND_SLUGS).find((name) => source.includes(name));
  const slug = key ? BRAND_SLUGS[key] : '';
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [slug]);
  if (!slug || failed) {
    return <span className="afg-brand-mark afg-brand-fallback" aria-label={provider}>{provider.slice(0, 2).toUpperCase()}</span>;
  }
  return (
    <span className="afg-brand-mark afg-brand-official">
      <img
        src={`https://cdn.simpleicons.org/${slug}`}
        alt={provider + ' logo'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
