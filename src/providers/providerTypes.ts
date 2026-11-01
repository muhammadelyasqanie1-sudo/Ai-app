export type AfgCapability =
  | 'chat'
  | 'vision'
  | 'image-generation'
  | 'video-generation'
  | 'file-processing'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'research';

export interface CapabilityFlags {
  text: boolean;
  streaming: boolean;
  vision: boolean;
  imageGen: boolean;
  tts: boolean;
  stt: boolean;
  tools: boolean;
  jsonMode: boolean;
}

export interface ModelDescriptor {
  id: string;
  providerId: string;
  displayName: string;
  description: string;
  contextWindow: number;
  capabilities: CapabilityFlags;
  enabled: boolean;
  verifiedAt: string | null;
}

export interface ConfigStatus {
  valid: boolean;
  message?: string;
}

export interface HealthStatus {
  healthy: boolean;
  checkedAt: string;
  message?: string;
}

export interface ChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}

export interface ChatChunk {
  content: string;
}

export interface ImageRequest { prompt: string; }
export interface ImageResult { url: string; }
export interface VisionRequest { imageUrl: string; prompt: string; }
export interface VisionResult { text: string; }
export interface AudioRequest { audio: Uint8Array; mimeType: string; }
export interface Transcription { text: string; }
export interface TTSRequest { text: string; voice?: string; }
export interface AudioResult { audio: Uint8Array; mimeType: string; }

export interface ProviderAdapter {
  readonly id: string;
  validateConfig(): Promise<ConfigStatus>;
  listModels(): Promise<ModelDescriptor[]>;
  healthCheck(modelId: string): Promise<HealthStatus>;
  capabilities(modelId: string): CapabilityFlags;
  streamChat(req: ChatRequest): AsyncIterable<ChatChunk>;
  generateImage?(req: ImageRequest): Promise<ImageResult>;
  analyzeImage?(req: VisionRequest): Promise<VisionResult>;
  transcribe?(req: AudioRequest): Promise<Transcription>;
  synthesize?(req: TTSRequest): Promise<AudioResult>;
  embed?(text: string): Promise<number[]>;
}

// Compatibility aliases for the existing chat API while services migrate to the full contract.
export type ProviderModel = Pick<ModelDescriptor, 'id' | 'displayName'> & { capabilities: AfgCapability[] };
export interface ProviderCatalog {
  verified: boolean;
  models: ProviderModel[];
  checkedAt?: string;
  error?: string;
  status: number;
}
export type ChatInput = ChatRequest;
export interface ChatProviderAdapter extends ProviderAdapter {
  readonly key: string;
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
