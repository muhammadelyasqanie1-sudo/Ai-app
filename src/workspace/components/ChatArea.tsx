/**
 * Message list + empty state + floating input.
 * On load (and whenever you switch chats) messages fade up one after another.
 */

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { SUGGESTIONS } from '../data';
import MessageBubble, { ThinkingBubble } from './MessageBubble';
import BottomInput from './BottomInput';

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export default function ChatArea() {
  const { activeChat, sendMessage, isReplying } = useWorkspace();
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [activeChat.messages.length, isReplying]);

  const empty = activeChat.messages.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Bottom padding keeps the last message clear of the floating input */}
        <div className="mx-auto w-full max-w-3xl px-4 pb-36 pt-6">
          {empty ? (
            <motion.div
              key={`empty-${activeChat.id}`}
              variants={listVariants}
              initial="hidden"
              animate="show"
              className="flex flex-col items-center pt-[12vh] text-center"
            >
              <motion.div
                variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-[#3b82f6] to-brand text-white shadow-sm"
              >
                <Sparkles size={22} />
              </motion.div>
              <motion.h2
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                className="mt-5 text-xl font-semibold tracking-tight"
              >
                What are we building?
              </motion.h2>
              <motion.p
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                className="mt-1 text-sm text-gray-500"
              >
                Ask about code, errors, or your app.
              </motion.p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <motion.button
                    key={s}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    whileHover={{ scale: 1.02, boxShadow: '0 6px 16px -8px rgba(37, 99, 235, 0.45)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void sendMessage(s)}
                    className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-800"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.ul key={activeChat.id} variants={listVariants} initial="hidden" animate="show" className="space-y-5">
              {activeChat.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <AnimatePresence>{isReplying && <ThinkingBubble key="thinking" />}</AnimatePresence>
            </motion.ul>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <BottomInput />
    </div>
  );
}
