/** Unmounted workspace prototype data. Production data comes from the API. */

import type { Chat, Project } from './types';

// No model is selected by default. Gemini is not a default or required provider.
export const DEFAULT_MODEL = '';

/** There is no fabricated seed conversation in this prototype. */
export const SEED_CHATS: Chat[] = [];

/** Projects are loaded from the real workspace API when this page is mounted. */
export const SEED_PROJECTS: Project[] = [];

export const SUGGESTIONS = [
  'Explain this error message',
  'Write a React component',
  'Review my function for bugs',
];
