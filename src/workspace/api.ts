/**
 * API boundary for the workspace UI.
 *
 * Every function here is a stub that returns mock data so the UI works on its
 * own. Replace the body of each one with a real call (for example a
 * `fetch('/api/...')` to the existing API edge in src/api/http.ts, or the
 * @google/genai SDK) when you wire the UI up. Components never call the
 * network directly, so these are the only places that need to change.
 */

import type { Message } from './types';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** API INJECTION POINT: chat completion. `history` includes the new user message. */
export async function sendChatMessage(history: Message[], model: string): Promise<string> {
  await wait(700);
  const last = history[history.length - 1]?.content ?? '';
  return `(${model}) Mock reply. Connect sendChatMessage() in src/workspace/api.ts to a real model.\n\nYou said: ${last}`;
}

/** API INJECTION POINT: run a shell command in the sandbox / device terminal. */
export async function runTerminalCommand(command: string): Promise<string> {
  await wait(250);
  return `mock: ${command}\n(connect runTerminalCommand() to a real shell)`;
}

export interface FileEntry {
  name: string;
  kind: 'folder' | 'file';
  size?: string;
}

/** API INJECTION POINT: list files in the active project. */
export async function listFiles(): Promise<FileEntry[]> {
  await wait(150);
  return [
    { name: 'src', kind: 'folder' },
    { name: 'public', kind: 'folder' },
    { name: 'package.json', kind: 'file', size: '1.5 KB' },
    { name: 'README.md', kind: 'file', size: '7.6 KB' },
    { name: 'server.ts', kind: 'file', size: '2.6 KB' },
  ];
}

/** API INJECTION POINT: image / video generation. Return a URL once real. */
export async function generateMedia(kind: 'image' | 'video', prompt: string): Promise<{ url?: string; note: string }> {
  await wait(900);
  return { note: `Mock ${kind} result for: ${prompt}` };
}

export interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  connected: boolean;
}

/** API INJECTION POINT: configured model providers and their connection state. */
export async function listProviders(): Promise<ProviderInfo[]> {
  await wait(100);
  return [
    { id: 'gemini', name: 'Google Gemini', model: 'gemini-2.5-pro', connected: true },
    { id: 'openai', name: 'OpenAI', model: 'gpt-4.1', connected: false },
    { id: 'anthropic', name: 'Anthropic', model: 'claude', connected: false },
    { id: 'local', name: 'On-device model', model: 'local', connected: false },
  ];
}
