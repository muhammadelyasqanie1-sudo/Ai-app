/** Fixed bottom bar for mobile. Hidden on desktop where the sidebar is permanent. */

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
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {ITEMS.map(({ view: target, label, icon: Icon }) => {
        const active = view === target;
        return (
          <button
            key={target}
            onClick={() => setView(target)}
            aria-current={active ? 'page' : undefined}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
              active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={20} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
