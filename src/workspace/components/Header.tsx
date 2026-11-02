/** Top bar: menu button (mobile), page/chat title, and model + Minimal badges. */

import { Menu } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import type { View } from '../types';

const VIEW_TITLES: Record<Exclude<View, 'chat'>, string> = {
  tools: 'Tools',
  terminal: 'Terminal',
  files: 'Files',
  settings: 'Settings',
  providers: 'Providers',
  offline: 'Offline Mode',
  media: 'Image & Video',
};

export default function Header() {
  const { view, activeChat, model, setSidebarOpen } = useWorkspace();
  const title = view === 'chat' ? activeChat.title : VIEW_TITLES[view];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open sidebar"
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
      >
        <Menu size={20} />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" dir="auto">
        {title}
      </h1>

      {view === 'chat' && (
        <div className="flex shrink-0 items-center gap-2">
          {/* MODEL INJECTION POINT: turn this pill into a model picker. */}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700">
            {model}
          </span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">Minimal</span>
        </div>
      )}
    </header>
  );
}
