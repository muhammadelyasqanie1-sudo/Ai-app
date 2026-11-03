export type AfgCapability =
  | 'chat'
  | 'vision'
  | 'ocr'
  | 'image-edit'
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
  imageEdit: boolean;
  ocr: boolean;
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
  noFallback?: boolean;
  onModelSelected?: (providerId: string, modelId: string) => void | Promise<void>;
}

export interface ChatChunk {
  content: string;
}

export type ImageStyleId = 'realistic' | 'digital-art' | 'anime' | '3d' | 'logo' | 'wallpaper' | 'social';
export interface ImageStylePreset { id: ImageStyleId; label: string; }
export interface ImageGenerationOptions {
  stylePresets: ImageStylePreset[];
  aspectRatios: string[];
  qualityLevels: string[];
}
export interface ImageRequest {
  prompt: string;
  stylePreset: ImageStyleId;
  aspectRatio: string;
  quality: string;
}
export interface ImageResult { url: string; mimeType?: string; }
export interface ImageEditRequest { image: Uint8Array; mimeType: string; instruction: string; mask?: Uint8Array; }
export interface VisionRequest { image: Uint8Array; mimeType: string; prompt: string; mode: 'describe' | 'ocr' | 'diagram' | 'screenshot'; }
export interface VisionResult { text: string; }
export interface AudioRequest { audio: Uint8Array; mimeType: string; language?: string; }
export interface Transcription { text: string; }
export interface TTSRequest { text: string; voice?: string; language?: string; }
export interface AudioResult { audio: Uint8Array; mimeType: string; }

export interface ProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  validateConfig(): Promise<ConfigStatus>;
  listModels(): Promise<ModelDescriptor[]>;
  healthCheck(modelId: string): Promise<HealthStatus>;
  capabilities(modelId: string): CapabilityFlags;
  streamChat(req: ChatRequest): AsyncIterable<ChatChunk>;
  imageGenerationOptions?(modelId: string): ImageGenerationOptions;
  generateImage?(req: ImageRequest): Promise<ImageResult>;
  editImage?(req: ImageEditRequest): Promise<ImageResult>;
  analyzeImage?(req: VisionRequest): Promise<VisionResult>;
  transcribe?(req: AudioRequest): Promise<Transcription>;
  synthesize?(req: TTSRequest): Promise<AudioResult>;
  voiceOptions?(modelId: string): Array<{ id: string; label: string }>;
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
