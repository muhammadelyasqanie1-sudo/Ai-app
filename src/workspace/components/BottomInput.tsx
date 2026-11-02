/**
 * Floating composer: + (attach), growing textarea, microphone, circular Send.
 * Enter sends, Shift+Enter inserts a new line.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, Mic, Plus } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';

export default function BottomInput() {
  const { sendMessage, isReplying } = useWorkspace();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content, up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const canSend = text.trim().length > 0 && !isReplying;

  const submit = () => {
    if (!canSend) return;
    void sendMessage(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-4 pt-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.25 }}
        className="pointer-events-auto mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-2xl border border-line bg-white p-2 shadow-[0_8px_30px_-12px_rgba(17,24,39,0.2)] transition-shadow focus-within:border-brand focus-within:shadow-[0_8px_30px_-12px_rgba(37,99,235,0.35)]"
      >
        {/* UPLOAD INJECTION POINT: attach files / images to the message. */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          aria-label="Add attachment"
          className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-canvas hover:text-gray-800"
        >
          <Plus size={20} />
        </motion.button>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          dir="auto"
          placeholder="Message"
          aria-label="Message"
          className="max-h-44 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm placeholder:text-gray-400 focus:outline-none"
        />

        {/* VOICE INJECTION POINT: start speech-to-text (Web Speech API or an API). */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          aria-label="Voice input"
          className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-canvas hover:text-gray-800"
        >
          <Mic size={19} />
        </motion.button>

        <motion.button
          onClick={submit}
          disabled={!canSend}
          whileHover={canSend ? { scale: 1.06 } : undefined}
          whileTap={canSend ? { scale: 0.92 } : undefined}
          aria-label="Send message"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors ${
            canSend ? 'bg-brand shadow-sm' : 'bg-gray-200 text-gray-400'
          }`}
        >
          <ArrowUp size={18} />
        </motion.button>
      </motion.div>
    </div>
  );
}
