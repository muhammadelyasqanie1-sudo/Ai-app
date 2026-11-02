/** Fixed bottom bar for mobile. Hidden on desktop where the sidebar is permanent. */

import { motion } from 'motion/react';
import { Folder, MessageSquare, Settings, Terminal } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import type { View } from '../types';

const ITEMS: { view: View; label: string; icon: typeof Terminal }[] = [
  { view: 'chat', label: 'Chat', icon: MessageSquare },
  { view: 'terminal', label: 'Terminal', icon: Terminal },
  { view: 'files', label: 'Files', icon: Folder },
  { view: 'settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const { view, setView } = useWorkspace();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {ITEMS.map(({ view: target, label, icon: Icon }) => {
        const active = view === target;
        return (
          <button
            key={target}
            onClick={() => setView(target)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex h-16 items-center justify-center text-xs font-medium transition-colors ${
              active ? 'text-brand' : 'text-gray-500'
            }`}
          >
            {/* A single indicator slides between the active items */}
            {active && (
              <motion.span
                layoutId="bottom-nav-indicator"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full bg-brand"
              />
            )}
            <motion.span whileTap={{ scale: 0.9 }} className="flex flex-col items-center gap-1">
              <Icon size={20} />
              {label}
            </motion.span>
          </button>
        );
      })}
    </nav>
  );
}
