/** Seed data so the UI has something to show. Replace with persisted data later. */

import type { Chat, Project } from './types';

const minutes = (n: number) => Date.now() - n * 60_000;
const hours = (n: number) => minutes(n * 60);
const days = (n: number) => hours(n * 24);

export const DEFAULT_MODEL = 'gemini-2.5-pro';

/** DATA INJECTION POINT: load chats from the database / API instead of this seed. */
export const SEED_CHATS: Chat[] = [
  {
    id: 'chat-1',
    title: 'Fix login redirect bug',
    subtitle: 'App workspace',
    updatedAt: minutes(12),
    messages: [
      { id: 'm1', role: 'user', content: 'The login redirect loops on mobile. Can you help?' },
      {
        id: 'm2',
        role: 'assistant',
        content:
          'Likely the redirect runs on every render. Move it into an effect:\n\n```tsx\nuseEffect(() => {\n  if (user) navigate("/home");\n}, [user]);\n```\n\nThat way it only fires when `user` changes.',
      },
    ],
  },
  { id: 'chat-2', title: 'Add dark mode toggle', subtitle: 'App workspace', updatedAt: hours(3), messages: [] },
  { id: 'chat-3', title: 'Refactor API client', subtitle: 'App workspace', updatedAt: days(1), messages: [] },
  { id: 'chat-4', title: 'Android build errors', subtitle: 'App workspace', updatedAt: days(4), messages: [] },
];

export const SEED_PROJECTS: Project[] = [
  { id: 'p1', name: 'Ai-app', subtitle: 'App workspace', updatedAt: minutes(12) },
  { id: 'p2', name: 'Telegram bot', subtitle: 'Python', updatedAt: days(5) },
];

export const SUGGESTIONS = [
  'Explain this error message',
  'Write a React component',
  'Review my function for bugs',
];
