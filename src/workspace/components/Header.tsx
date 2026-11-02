/**
 * Top bar: sidebar toggle, title, model selector and a softly glowing "Minimal" badge.
 */

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Menu, PanelLeft } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { MODELS } from '../data';
import { useDismiss, useIsDesktop } from '../hooks';
import type { View } from '../types';

const VIEW_TITLES: Record<Exclude<View, 'chat'>, string> = {
  terminal: 'Terminal',
  files: 'Files',
  settings: 'Settings',
  providers: 'Providers',
  offline: 'Offline Chat',
  media: 'Image & Video',
};

function ModelSelector() {
  const { model, setModel } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        whileHover={{ scale: 1.02, boxShadow: '0 4px 12px -4px rgba(17, 24, 39, 0.15)' }}
        whileTap={{ scale: 0.98 }}
        className="flex max-w-[10rem] items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 font-mono text-xs text-gray-700 sm:max-w-none"
      >
        <span className="truncate">{model}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Model"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="absolute end-0 top-full z-20 mt-2 w-60 origin-top rounded-2xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(17,24,39,0.25)]"
          >
            {MODELS.map((m) => (
              <li key={m.id}>
                <button
                  role="option"
                  aria-selected={m.id === model}
                  onClick={() => {
                    setModel(m.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start transition-colors hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-gray-800">{m.id}</span>
                    <span className="block text-xs text-gray-400">{m.hint}</span>
                  </span>
                  {m.id === model && <Check size={15} className="text-brand" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header() {
  const { view, activeChat, collapsed, toggleCollapsed, setSidebarOpen } = useWorkspace();
  const isDesktop = useIsDesktop();
  const title = view === 'chat' ? activeChat.title : VIEW_TITLES[view];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 sm:px-4">
      {/* Mobile: opens the drawer. Desktop: only shown while the sidebar is collapsed. */}
      {(!isDesktop || collapsed) && (
        <button
          onClick={isDesktop ? toggleCollapsed : () => setSidebarOpen(true)}
          aria-label={isDesktop ? 'Expand sidebar' : 'Open sidebar'}
          className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-white"
        >
          {isDesktop ? <PanelLeft size={20} /> : <Menu size={20} />}
        </button>
      )}

      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" dir="auto">
        {title}
      </h1>

      {view === 'chat' && (
        <div className="flex shrink-0 items-center gap-2">
          <ModelSelector />
          <span className="ws-glow rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            Minimal
          </span>
        </div>
      )}
    </header>
  );
}
