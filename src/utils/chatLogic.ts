export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  reasoning?: string;
  isStreaming?: boolean;
  modelUsed?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  isArchived?: boolean;
  isPinned?: boolean;
}

export interface MarkdownBlock {
  type: 'text' | 'code' | 'heading' | 'list' | 'quote';
  content: string;
  lang?: string;
  level?: number;
}

/**
 * Generates a concise title from the user's initial prompt
 */
export function generateTitleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[#*`_]/g, '')
    .replace(/\s+/g, ' ');

  if (!cleaned) return 'New chat';

  const firstSentence = cleaned.split(/[.?!:\n]/)[0].trim();
  const words = firstSentence.split(' ');

  if (words.length <= 6) {
    return firstSentence.slice(0, 40);
  }

  return words.slice(0, 5).join(' ') + '...';
}

/**
 * Categorizes conversations by relative time periods
 */
export function groupConversationsByDate(conversations: Conversation[], now: number = Date.now()): Record<string, Conversation[]> {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    Older: [],
  };

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  for (const conv of sorted) {
    const diff = startOfTodayMs - conv.updatedAt;

    if (conv.updatedAt >= startOfTodayMs) {
      groups.Today.push(conv);
    } else if (diff < ONE_DAY) {
      groups.Yesterday.push(conv);
    } else if (diff < 7 * ONE_DAY) {
      groups['Previous 7 Days'].push(conv);
    } else if (diff < 30 * ONE_DAY) {
      groups['Previous 30 Days'].push(conv);
    } else {
      groups.Older.push(conv);
    }
  }

  // Remove empty groups
  const filtered: Record<string, Conversation[]> = {};
  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 0) {
      filtered[key] = list;
    }
  }

  return filtered;
}

/**
 * Filters conversations matching search keywords
 */
export function filterConversations(conversations: Conversation[], query: string): Conversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;

  return conversations.filter((c) => {
    if (c.title.toLowerCase().includes(q)) return true;
    return c.messages.some((m) => m.content.toLowerCase().includes(q));
  });
}

/**
 * Parses markdown into structured renderable blocks (code blocks, text, headers)
 */
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  if (!text) return [];

  const blocks: MarkdownBlock[] = [];
  const lines = text.split('\n');

  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({
        type: 'text',
        content: textBuffer.join('\n'),
      });
      textBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCode) {
        // End of code block
        blocks.push({
          type: 'code',
          content: codeBuffer.join('\n'),
          lang: codeLang || 'plaintext',
        });
        codeBuffer = [];
        inCode = false;
        codeLang = '';
      } else {
        // Start of code block
        flushText();
        inCode = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Header detection outside code
    if (line.startsWith('### ')) {
      flushText();
      blocks.push({ type: 'heading', level: 3, content: line.slice(4).trim() });
      continue;
    } else if (line.startsWith('## ')) {
      flushText();
      blocks.push({ type: 'heading', level: 2, content: line.slice(3).trim() });
      continue;
    } else if (line.startsWith('# ')) {
      flushText();
      blocks.push({ type: 'heading', level: 1, content: line.slice(2).trim() });
      continue;
    }

    textBuffer.push(line);
  }

  if (inCode) {
    blocks.push({
      type: 'code',
      content: codeBuffer.join('\n'),
      lang: codeLang || 'plaintext',
    });
  } else {
    flushText();
  }

  return blocks;
}

/**
 * Rough token count estimation (approx 4 chars per token)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
