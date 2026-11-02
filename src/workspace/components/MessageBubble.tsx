/**
 * Chat bubbles. User messages sit on the right (light gray), AI messages on the
 * left (white with a subtle border). The row is forced LTR so the sides stay
 * fixed; each bubble uses dir="auto" so Persian text still reads right-to-left.
 *
 * For full markdown, math and syntax highlighting, swap MessageContent for the
 * existing src/components/MarkdownRenderer.tsx.
 */

import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import type { Message } from '../types';

/** Child variants: the parent list in ChatArea staggers these on load. */
const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
} as const;

function Avatar() {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#3b82f6] to-brand text-white">
      <Sparkles size={14} />
    </div>
  );
}

/** Split text on ``` fences into plain and code parts. */
function MessageContent({ text }: { text: string }) {
  const parts = text.split(/```(?:\w+)?\n?/);
  return (
    <div className="space-y-3">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            dir="ltr"
            className="overflow-x-auto rounded-xl border border-line bg-canvas p-3 font-mono text-[13px] leading-relaxed text-gray-800"
          >
            <code>{part.trimEnd()}</code>
          </pre>
        ) : part.trim() ? (
          <p key={i} dir="auto" className="whitespace-pre-wrap leading-relaxed">
            {part.trim()}
          </p>
        ) : null,
      )}
    </div>
  );
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <motion.li variants={rise} dir="ltr" className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-2.5 text-sm" dir="auto">
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
      ) : (
        <div className="flex max-w-[92%] gap-3 text-sm">
          <Avatar />
          <div className="min-w-0 rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <MessageContent text={message.content} />
          </div>
        </div>
      )}
    </motion.li>
  );
}

/** Shown while the AI is "thinking": three bouncing dots inside an AI bubble. */
export function ThinkingBubble() {
  return (
    <motion.li
      dir="ltr"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
      className="flex justify-start"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <Avatar />
        <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-white px-4 py-3.5">
          <span className="sr-only">Assistant is thinking</span>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-brand/70"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.li>
  );
}
