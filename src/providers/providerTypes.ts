export type AfgCapability =
  | 'chat'
  | 'vision'
  | 'image-generation'
  | 'video-generation'
  | 'file-processing'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'research';

export interface ProviderModel {
  id: string;
  displayName: string;
  capabilities: AfgCapability[];
}

export interface ProviderCatalog {
  verified: boolean;
  models: ProviderModel[];
  checkedAt?: string;
  error?: string;
  status: number;
}

export interface ChatInput {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export interface ChatProviderAdapter {
  readonly key: string;
  readonly displayName: string;
  listModels(): Promise<ProviderCatalog>;
  streamChat(input: ChatInput): AsyncGenerator<string, void, void>;
}

export class ProviderAdapterError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 502, code = 'provider_error') {
    super(message);
    this.name = 'ProviderAdapterError';
    this.status = status;
    this.code = code;
  }
}
