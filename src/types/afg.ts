export type Language = 'dari' | 'english' | 'pashto' | 'persian' | 'arabic' | 'urdu' | 'turkish' | 'russian' | 'french' | 'spanish' | 'german' | 'chinese' | 'hindi' | 'bengali' | 'indonesian' | 'portuguese' | 'japanese' | 'korean';
export type Theme = 'dark' | 'light' | 'neon' | 'system';

export type TabType = 
  | 'home'
  | 'tasks'
  | 'files'
  | 'voice'
  | 'automation'
  | 'browser'
  | 'knowledge'
  | 'memory'
  | 'chat' 
  | 'image-gen' 
  | 'video-gen' 
  | 'tools' 
  | 'terminal'
  | 'jarvis'
  | 'offline-learning'
  | 'offline-ai-hub'
  | 'offline-chat'
  | 'offline-models'
  | 'history'
  | 'settings' 
  | 'admin';

export type ToolSubTab = 
  | 'overview'
  | 'translate'
  | 'pdf-tools'
  | 'voice-tools'
  | 'file-tools'
  | 'calculator'
  | 'qr-scanner'
  | 'code-help'
  | 'writing-studio'
  | 'research'
  | 'summarizer'
  | 'productivity'
  | 'api-hub'
  | 'mcp'
  | '9router'
  | 'developer-tools';

export interface UserProfile {
  id?: string;
  name: string;
  nameEn: string;
  email: string;
  avatar: string;
  isPremium: boolean;
  tier: string;
  role?: string;
}

export interface ChatAttachment {
  type: 'gallery' | 'camera' | 'file' | 'link';
  name: string;
  url?: string;
  size?: string;
}

export interface AfgMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: ChatAttachment[];
  thought?: string;
  isStreaming?: boolean;
  retryable?: boolean;
  isError?: boolean;
  isCancelled?: boolean;
}

export interface AfgChatSession {
  id: string;
  title: string;
  titleDari?: string;
  lastMessage: string;
  timestamp: number;
  messages: AfgMessage[];
  category: 'general' | 'image' | 'code' | 'translation' | 'tools';
  isPinned?: boolean;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  promptDari?: string;
  style: 'HD' | 'Anime' | 'Realistic' | 'Art' | '3D Render';
  aspect: '1:1' | '16:9' | '9:16' | '4:3';
  url: string;
  timestamp: number;
  saved?: boolean;
}

export interface GeneratedVideo {
  id: string;
  prompt: string;
  aspect: '9:16' | '16:9' | '1:1';
  duration: number; // in seconds
  thumbnail: string;
  videoUrl: string;
  timestamp: number;
}


export type AfgCapabilityKey =
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

export interface AfgModelOption {
  id: string;
  providerId: string;
  contextWindow: number;
  capabilities: Record<string, boolean>;
  displayName: string;
  selectable: boolean;
  disabledReason: string | null;
  verifiedAt: string | null;
  pricing?: { inputPerMillion: number | null; outputPerMillion: number | null; currency?: string };
  requiresSubscription?: boolean;
  accessTier?: 'free' | 'pro' | 'max' | 'ultra' | 'unknown';
  catalogKind?: string;
}

export interface AfgCapabilitySnapshot {
  verified: boolean;
  models: string[];
  modelDescriptors?: AfgModelOption[];
  capabilities: Record<AfgCapabilityKey, boolean>;
  checkedAt?: string;
}
