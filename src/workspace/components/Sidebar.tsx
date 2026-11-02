/**
 * Left sidebar.
 * Desktop (lg+): permanent column. Mobile: slide-in drawer with a dimmed overlay.
 * Uses logical properties and rtl: variants so it mirrors automatically in RTL.
 */

import { MoreHorizontal, PenSquare, Search, Settings, Sparkles, Wrench, Plug, X } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { timeAgo } from '../utils';
import type { View } from '../types';

export default function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    tab,
    setTab,
    search,
    setSearch,
    filteredChats,
    projects,
    activeChat,
    selectChat,
    newChat,
    view,
    setView,
  } = useWorkspace();

  const go = (target: View) => {
    setView(target);
    setSidebarOpen(false);
  };

  const nav: { view: View; label: string; icon: typeof Wrench }[] = [
    { view: 'tools', label: 'Tools', icon: Wrench },
    { view: 'providers', label: 'Providers', icon: Plug },
    { view: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Overlay (mobile only) */}
      <div
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-slate-900/30 transition-opacity duration-300 lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 start-0 z-40 flex w-72 flex-col border-e border-slate-200 bg-slate-50 transition-transform duration-300 ease-out lg:static lg:z-auto lg:translate-x-0 lg:rtl:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        {/* Top: logo + close (mobile) */}
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white">
              <Sparkles size={16} />
            </div>
            <span className="text-sm font-semibold tracking-tight">AFG AI Code</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* New chat */}
        <div className="px-4 pt-2">
          <button
            onClick={newChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800"
          >
            <PenSquare size={16} />
            New Code chat
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <label className="relative block">
            <span className="sr-only">Search chats and messages</span>
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats and messages"
              dir="auto"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 ps-9 pe-3 text-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </label>
        </div>

        {/* Tabs */}
        <div role="tablist" className="mx-4 mt-3 grid grid-cols-2 rounded-xl bg-slate-200/60 p-1 text-sm">
          {(['chats', 'projects'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg py-1.5 font-medium capitalize transition-colors ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
          {tab === 'chats' ? (
            filteredChats.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">No chats found</p>
            ) : (
              <ul className="space-y-0.5">
                {filteredChats.map((chat) => {
                  const active = chat.id === activeChat?.id && view === 'chat';
                  return (
                    <li key={chat.id}>
                      <div
                        className={`group flex items-center gap-1 rounded-xl pe-1 transition-colors ${
                          active ? 'bg-blue-50' : 'hover:bg-slate-100'
                        }`}
                      >
                        <button onClick={() => selectChat(chat.id)} className="min-w-0 flex-1 px-3 py-2 text-start">
                          <div className={`truncate text-sm font-medium ${active ? 'text-blue-800' : 'text-slate-800'}`} dir="auto">
                            {chat.title}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                            <span className="truncate">{chat.subtitle}</span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">{timeAgo(chat.updatedAt)}</span>
                          </div>
                        </button>
                        {/* ACTIONS INJECTION POINT: rename / pin / delete menu */}
                        <button
                          aria-label={`Actions for ${chat.title}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <ul className="space-y-0.5">
              {projects.map((p) => (
                <li key={p.id}>
                  <button className="w-full rounded-xl px-3 py-2 text-start hover:bg-slate-100">
                    <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {p.subtitle} · {timeAgo(p.updatedAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bottom navigation */}
        <nav aria-label="Workspace" className="border-t border-slate-200 p-2">
          {nav.map(({ view: target, label, icon: Icon }) => (
            <button
              key={target}
              onClick={() => go(target)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                view === target ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
