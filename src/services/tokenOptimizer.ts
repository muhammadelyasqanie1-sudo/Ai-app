/**
 * Conservative, lossless token optimization for chat payloads.
 *
 * This deliberately does not summarize, truncate, rewrite code, JSON, URLs,
 * identifiers, or user instructions. It only normalizes redundant whitespace
 * outside fenced code blocks and removes immediately repeated identical turns.
 */
export type OptimizableMessage = { role: string; content: string; [key: string]: unknown };

function compactOutsideCode(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) return part;
    return part
      .replace(/[ \t]+$/gm, '')
      .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n');
  }).join('');
}

export function optimizeChatMessages<T extends OptimizableMessage>(
  messages: T[],
  enabled = true,
): { messages: T[]; beforeChars: number; afterChars: number; removedDuplicates: number } {
  const beforeChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (!enabled) return { messages, beforeChars, afterChars: beforeChars, removedDuplicates: 0 };

  const optimized: T[] = [];
  let removedDuplicates = 0;
  for (const message of messages) {
    const content = compactOutsideCode(message.content);
    const previous = optimized[optimized.length - 1];
    if (previous && previous.role === message.role && previous.content === content) {
      removedDuplicates++;
      continue;
    }
    optimized.push({ ...message, content });
  }
  const afterChars = optimized.reduce((sum, message) => sum + message.content.length, 0);
  return { messages: optimized, beforeChars, afterChars, removedDuplicates };
}

export function estimateTokenCount(text: string): number {
  // Character-based estimate only; provider-reported token usage remains authoritative.
  return Math.ceil(text.length / 4);
}
