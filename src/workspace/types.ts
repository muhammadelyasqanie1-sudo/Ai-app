/** Shared types for the minimal workspace UI. */

export type SidebarTab = 'chats' | 'projects';

export type Direction = 'ltr' | 'rtl';

/** Every screen the main area can show. The Tools dropdown links to most of them. */
export type View = 'chat' | 'terminal' | 'files' | 'settings' | 'providers' | 'offline' | 'media';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface Chat {
  id: string;
  title: string;
  subtitle: string;
  /** Epoch milliseconds of the last activity. */
  updatedAt: number;
  messages: Message[];
}

export interface Project {
  id: string;
  name: string;
  subtitle: string;
  updatedAt: number;
}

export interface ModelOption {
  id: string;
  hint: string;
}
