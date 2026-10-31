export type Language = 'dari' | 'english';
export type Theme = 'dark' | 'light';

export type TabType = 
  | 'home' 
  | 'chat' 
  | 'image-gen' 
  | 'video-gen' 
  | 'tools' 
  | 'history' 
  | 'wallet' 
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
  | 'summarizer';

export interface UserProfile {
  name: string;
  nameEn: string;
  email: string;
  avatar: string;
  coins: number;
  isPremium: boolean;
  tier: string;
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
}

export interface AfgChatSession {
  id: string;
  title: string;
  titleDari?: string;
  lastMessage: string;
  timestamp: number;
  messages: AfgMessage[];
  category: 'general' | 'image' | 'code' | 'translation' | 'tools';
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

export interface CoinPackage {
  id: string;
  coins: number;
  price: string;
  bonus?: number;
  popular?: boolean;
  bestValue?: boolean;
}
