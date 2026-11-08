/**
 * API boundary for the legacy workspace prototype.
 *
 * This prototype is not mounted by the production application. It must never
 * return simulated AI output: the real chat path lives in src/App.tsx and
 * src/api/chatHandler.ts through the server-side provider gateway.
 */

import type { Message } from './types';

/** API INJECTION POINT: chat completion. `history` includes the new user message. */
export async function sendChatMessage(_history: Message[], _model: string): Promise<string> {
  throw new Error('The workspace prototype is not connected to the server provider gateway.');
}

/** API INJECTION POINT: run a shell command in the sandbox / device terminal. */
export async function runTerminalCommand(_command: string): Promise<string> {
  throw new Error('Terminal execution is unavailable until an isolated sandbox is configured.');
}

export interface FileEntry {
  name: string;
  kind: 'folder' | 'file';
  size?: string;
}

/** API INJECTION POINT: list files in the active project. */
export async function listFiles(): Promise<FileEntry[]> {
  // The production file library is src/components/afg/AfgFileLibrary.tsx.
  return [];
}

/** API INJECTION POINT: image / video generation. Return a URL once real. */
export async function generateMedia(_kind: 'image' | 'video', _prompt: string): Promise<{ url?: string; note: string }> {
  return { note: 'Media generation is unavailable until a verified provider capability is configured.' };
}

export interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  connected: boolean;
}

/** API INJECTION POINT: configured model providers and their connection state. */
export async function listProviders(): Promise<ProviderInfo[]> {
  // No mock provider inventory: the production control plane exposes only 9Router and Ollama.
  return [];
}
