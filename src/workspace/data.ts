/** Seed data so the UI has something to show. Replace with persisted data later. */

import type { Chat, ModelOption, Project } from './types';

const minutes = (n: number) => Date.now() - n * 60_000;
const hours = (n: number) => minutes(n * 60);
const days = (n: number) => hours(n * 24);

export const DEFAULT_MODEL = 'gemini-2.5-pro';

/** MODEL INJECTION POINT: load the real model list from your providers. */
export const MODELS: ModelOption[] = [
  { id: 'gemini-2.5-pro', hint: 'Most capable' },
  { id: 'gemini-2.5-flash', hint: 'Fastest' },
  { id: 'offline-local', hint: 'On-device' },
];

/** Id of the chat that is open when the page loads. */
export const INITIAL_CHAT_ID = 'chat-hello';

/** DATA INJECTION POINT: load chats from the database / API instead of this seed. */
export const SEED_CHATS: Chat[] = [
  {
    id: 'chat-login',
    title: 'Fix login redirect bug',
    subtitle: 'App workspace',
    updatedAt: minutes(12),
    messages: [
      { id: 'l1', role: 'user', content: 'The login redirect loops on mobile. Can you help?' },
      {
        id: 'l2',
        role: 'assistant',
        content:
          'Likely the redirect runs on every render. Move it into an effect:\n\n```tsx\nuseEffect(() => {\n  if (user) navigate("/home");\n}, [user]);\n```\n\nThat way it only fires when `user` changes.',
      },
    ],
  },
  {
    id: INITIAL_CHAT_ID,
    title: 'سلام',
    subtitle: 'App workspace',
    updatedAt: hours(15),
    messages: [
      { id: 'h1', role: 'user', content: 'سلام' },
      {
        id: 'h2',
        role: 'assistant',
        content: 'سلام! چطور می‌توانم در ساخت اپلیکیشن به شما کمک کنم؟',
      },
      { id: 'h3', role: 'user', content: 'می‌خواهم یک صفحه ورود بسازم' },
      {
        id: 'h4',
        role: 'assistant',
        content:
          'با انجام این کار شروع می‌کنیم. یک فرم ساده با ایمیل و رمز عبور:\n\n```tsx\nexport function LoginPage() {\n  return (\n    <form className="grid gap-3">\n      <input type="email" placeholder="Email" />\n      <input type="password" placeholder="Password" />\n      <button type="submit">Sign in</button>\n    </form>\n  );\n}\n```\n\nاگر می‌خواهید استایل و اعتبارسنجی هم اضافه کنم؟',
      },
    ],
  },
  { id: 'chat-dark', title: 'Add dark mode toggle', subtitle: 'App workspace', updatedAt: hours(30), messages: [] },
  { id: 'chat-home', title: 'طراحی صفحه اصلی', subtitle: 'App workspace', updatedAt: days(2), messages: [] },
  { id: 'chat-api', title: 'Refactor API client', subtitle: 'App workspace', updatedAt: days(4), messages: [] },
];

export const SEED_PROJECTS: Project[] = [
  { id: 'p1', name: 'Ai-app', subtitle: 'App workspace', updatedAt: minutes(12) },
  { id: 'p2', name: 'Telegram bot', subtitle: 'Python', updatedAt: days(5) },
];

export const SUGGESTIONS = ['Explain this error message', 'Write a React component', 'Review my function for bugs'];
