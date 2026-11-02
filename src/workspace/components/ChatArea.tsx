/**
 * Message list + empty state.
 * The tiny fenced-code renderer below keeps this file dependency-free. For full
 * markdown, math and syntax highlighting, swap it for the existing
 * src/components/MarkdownRenderer.tsx.
 */

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { SUGGESTIONS } from '../data';
import InputBox from './InputBox';

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
            className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-800"
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

export default function ChatArea() {
  const { activeChat, sendMessage, isReplying } = useWorkspace();
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [activeChat.messages.length, isReplying]);

  const empty = activeChat.messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {empty ? (
            <div className="ws-fade-in flex flex-col items-center pt-[12vh] text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white">
                <Sparkles size={22} />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">What are we building?</h2>
              <p className="mt-1 text-sm text-slate-500">Ask about code, errors, or your project.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void sendMessage(s)}
                    className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-6">
              {activeChat.messages.map((m) => (
                <li key={m.id} className={`ws-fade-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2.5 text-sm" dir="auto">
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  ) : (
                    <div className="flex max-w-full gap-3 text-sm">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                        <Sparkles size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <MessageContent text={m.content} />
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {isReplying && (
                <li className="flex items-center gap-1.5 ps-10 text-slate-400" aria-live="polite">
                  <span className="sr-only">Assistant is typing</span>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
                </li>
              )}
            </ul>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <InputBox />
    </div>
  );
}
