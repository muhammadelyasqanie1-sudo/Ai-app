/**
 * The "Tools" menu. All functionality is reachable from here so the main UI
 * stays clean. Opens upward from the sidebar's Tools button.
 *
 * Motion: fades in and scales from 95% to 100% with a spring; items stagger in.
 */

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Code, Folder, Image as ImageIcon, SlidersHorizontal, Terminal, WifiOff, Wrench } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { useDismiss } from '../hooks';
import type { View } from '../types';

const ITEMS: { view: View; title: string; fa: string; icon: typeof Code }[] = [
  { view: 'chat', title: 'Code Chat', fa: 'چت کد', icon: Code },
  { view: 'offline', title: 'Offline Chat', fa: 'چت آفلاین', icon: WifiOff },
  { view: 'terminal', title: 'Terminal', fa: 'ترمینال', icon: Terminal },
  { view: 'media', title: 'Image / Video Generation', fa: 'تولید عکس/ویدیو', icon: ImageIcon },
  { view: 'providers', title: 'Settings / Providers', fa: 'تنظیمات / ارائه‌دهندگان', icon: SlidersHorizontal },
  { view: 'files', title: 'Files', fa: 'فایل‌ها', icon: Folder },
];

const menuVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 420, damping: 28, staggerChildren: 0.03, delayChildren: 0.04 },
  },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.12 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0 },
} as const;

export default function ToolsDropdown() {
  const { setView, setSidebarOpen, dir } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const choose = (view: View) => {
    setView(view);
    setOpen(false);
    setSidebarOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        whileHover={{ x: dir === 'rtl' ? -2 : 2 }}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          open ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-canvas'
        }`}
      >
        <Wrench size={17} />
        Tools
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Tools"
            variants={menuVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-[70vh] origin-bottom overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(17,24,39,0.25)]"
          >
            {ITEMS.map(({ view, title, fa, icon: Icon }) => (
              <motion.button
                key={title}
                role="menuitem"
                variants={itemVariants}
                onClick={() => choose(view)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-canvas"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-800">{title}</span>
                  <span className="block truncate text-xs text-gray-400" dir="rtl">
                    {fa}
                  </span>
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
