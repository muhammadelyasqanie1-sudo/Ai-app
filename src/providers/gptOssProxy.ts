import { createOpenAICompatibleAdapter } from './openAiCompatible.ts';

// The GPT-OSS proxy exposes only GET /v1/models and POST /v1/chat/completions.
// Its catalog endpoint is therefore used for a non-generative health check.
export const gptOssProxy = createOpenAICompatibleAdapter({
  envPrefix: 'GPTOSS',
  defaultId: 'gpt-oss-proxy',
  defaultDisplayName: 'GPT-OSS Proxy',
  healthByCatalog: true,
  reasoningEffort: 'medium',
});
