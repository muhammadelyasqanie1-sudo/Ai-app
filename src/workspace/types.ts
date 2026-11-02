/** Shared types for the minimal workspace UI. */

export type SidebarTab = 'chats' | 'projects';

/** Every screen the main area can show. Tools hub links to most of them. */
export type View =
  | 'chat'
  | 'tools'
  | 'terminal'
  | 'files'
  | 'settings'
  | 'providers'
  | 'offline'
  | 'media';

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
