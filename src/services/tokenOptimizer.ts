/**
 * Lossless, conservative optimization for chat request messages.
 * Never removes a turn: repeated questions can be intentional.
 * Only trims trailing horizontal whitespace and collapses excessive blank lines
 * outside fenced code blocks.
 */
export type OptimizableMessage = { role: string; content: string; [key: string]: unknown };

function compactOutsideCode(text: string): string {
  const parts = text.split(/(```[\s\S]*?(?:```|$))/g);
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

  const optimized = messages.map((message) => ({
    ...message,
    content: compactOutsideCode(message.content),
  }));
  const afterChars = optimized.reduce((sum, message) => sum + message.content.length, 0);
  return { messages: optimized, beforeChars, afterChars, removedDuplicates: 0 };
}

export function estimateTokenCount(text: string): number {
  // Character-based estimate only; provider-reported token usage remains authoritative.
  return Math.ceil(text.length / 4);
}
