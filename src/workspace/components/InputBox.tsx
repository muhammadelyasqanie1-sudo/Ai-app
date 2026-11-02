/** Message composer: auto-growing textarea, Enter to send, Shift+Enter for a new line. */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Paperclip } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';

export default function InputBox() {
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

  const submit = () => {
    if (!text.trim() || isReplying) return;
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
    <div className="shrink-0 bg-white px-4 pb-3 pt-2">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-600">
        {/* UPLOAD INJECTION POINT: attach files / images to the message. */}
        <button aria-label="Attach file" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Paperclip size={18} />
        </button>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          dir="auto"
          placeholder="Ask anything about your code"
          aria-label="Message"
          className="max-h-44 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
        />

        <button
          onClick={submit}
          disabled={!text.trim() || isReplying}
          aria-label="Send message"
          className="rounded-xl bg-blue-700 p-2 text-white transition-colors hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}
