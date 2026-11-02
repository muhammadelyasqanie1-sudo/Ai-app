/**
 * Left sidebar.
 *
 * Desktop (lg+): permanent column that slides in on load and can be collapsed.
 * Mobile: slide-in drawer with a dimmed overlay.
 *
 * Motion:
 *  - page load: slides in from the start edge, chat rows stagger in
 *  - tabs: one pill glides between "Chats" and "Projects" (shared layoutId)
 *  - chat rows: nudge 2px toward the end on hover; the dots menu fades in
 */

import { AnimatePresence, motion } from 'motion/react';
import { MoreHorizontal, PanelLeftClose, Plug, Plus, Search, Settings, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { useIsDesktop } from '../hooks';
import { timeAgo } from '../utils';
import type { View } from '../types';
import ToolsDropdown from './ToolsDropdown';

const SIDEBAR_WIDTH = 288;
const slide = { type: 'spring', duration: 0.45, bounce: 0 } as const;

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.15 } },
};
const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0 },
};

export default function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    collapsed,
    toggleCollapsed,
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
    dir,
  } = useWorkspace();
  const isDesktop = useIsDesktop();

  const rtl = dir === 'rtl';
  const hiddenX = rtl ? '100%' : '-100%';
  const hidden = isDesktop ? collapsed : !sidebarOpen;

  const go = (target: View) => {
    setView(target);
    setSidebarOpen(false);
  };

  const secondaryNav: { view: View; label: string; icon: typeof Plug }[] = [
    { view: 'providers', label: 'Providers', icon: Plug },
    { view: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Overlay (mobile only) */}
      <AnimatePresence>
        {!isDesktop && sidebarOpen && (
          <motion.div
            key="overlay"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-gray-900/30 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>

      <motion.aside
        aria-label="Sidebar"
        inert={hidden}
        initial={
          isDesktop
            ? { opacity: 0, x: rtl ? 32 : -32, width: SIDEBAR_WIDTH }
            : { x: hiddenX, width: SIDEBAR_WIDTH }
        }
        animate={
          isDesktop
            ? { opacity: 1, x: 0, width: collapsed ? 0 : SIDEBAR_WIDTH }
            : { opacity: 1, x: sidebarOpen ? 0 : hiddenX, width: SIDEBAR_WIDTH }
        }
        transition={slide}
        className={`shrink-0 overflow-hidden border-e bg-white ${
          isDesktop ? 'relative' : 'fixed inset-y-0 start-0 z-40'
        } ${isDesktop && collapsed ? 'border-transparent' : 'border-line'}`}
      >
        {/* Fixed-width inner so content doesn't reflow while the width animates */}
        <div className="flex h-full w-72 flex-col">
          {/* Top: logo + close / collapse */}
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-[#3b82f6] to-brand text-white shadow-sm">
                <Sparkles size={16} />
              </div>
              <span className="text-sm font-semibold tracking-tight">AFG AI Builder</span>
            </div>
            <button
              onClick={isDesktop ? toggleCollapsed : () => setSidebarOpen(false)}
              aria-label={isDesktop ? 'Collapse sidebar' : 'Close sidebar'}
              className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-canvas hover:text-gray-800"
            >
              {isDesktop ? <PanelLeftClose size={18} /> : <X size={18} />}
            </button>
          </div>

          {/* New Code Chat */}
          <div className="px-4 pt-2">
            <motion.button
              onClick={newChat}
              whileHover={{ scale: 1.02, boxShadow: '0 10px 22px -8px rgba(37, 99, 235, 0.55)' }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#3b82f6] to-brand px-3 py-2.5 text-sm font-medium text-white shadow-sm"
            >
              <Plus size={17} />
              New Code Chat
            </motion.button>
          </div>

          {/* Search: the icon glows while the field has focus */}
          <div className="px-4 pt-3">
            <label className="group relative block">
              <span className="sr-only">Search chats and messages</span>
              <Search
                size={15}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 transition-all duration-200 group-focus-within:text-brand group-focus-within:drop-shadow-[0_0_6px_rgba(37,99,235,0.6)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats and messages"
                dir="auto"
                className="w-full rounded-xl border border-line bg-canvas py-2 ps-9 pe-3 text-sm transition-shadow placeholder:text-gray-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
              />
            </label>
          </div>

          {/* Tabs: a single pill glides between the two options */}
          <div role="tablist" className="relative mx-4 mt-3 grid grid-cols-2 rounded-2xl border border-line bg-canvas p-1 text-sm">
            {(['chats', 'projects'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="relative rounded-xl py-1.5 font-medium capitalize"
              >
                {tab === t && (
                  <motion.span
                    layoutId="sidebar-tab-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                    className="absolute inset-0 rounded-xl bg-white shadow-sm"
                  />
                )}
                <span className={`relative transition-colors ${tab === t ? 'text-gray-900' : 'text-gray-500'}`}>{t}</span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
            {tab === 'chats' ? (
              filteredChats.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">No chats found</p>
              ) : (
                <motion.ul key="chats" variants={listVariants} initial="hidden" animate="show" className="space-y-0.5">
                  {filteredChats.map((chat) => {
                    const active = chat.id === activeChat?.id && view === 'chat';
                    return (
                      <motion.li
                        key={chat.id}
                        variants={rowVariants}
                        whileHover={{ x: rtl ? -2 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="group"
                      >
                        <div
                          className={`flex items-center rounded-xl pe-1 transition-colors ${
                            active ? 'bg-blue-50' : 'hover:bg-canvas'
                          }`}
                        >
                          <button onClick={() => selectChat(chat.id)} className="min-w-0 flex-1 px-3 py-2.5 text-start">
                            <div
                              className={`truncate text-sm font-medium ${active ? 'text-blue-800' : 'text-gray-800'}`}
                              dir="auto"
                            >
                              {chat.title}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-gray-400">
                              {chat.subtitle} • {timeAgo(chat.updatedAt)}
                            </div>
                          </button>
                          {/* ACTIONS INJECTION POINT: rename / pin / delete menu.
                              Fades in on hover or keyboard focus; always visible on touch. */}
                          <button
                            aria-label={`Actions for ${chat.title}`}
                            className="rounded-xl p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-white hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )
            ) : (
              <motion.ul key="projects" variants={listVariants} initial="hidden" animate="show" className="space-y-0.5">
                {projects.map((p) => (
                  <motion.li key={p.id} variants={rowVariants} whileHover={{ x: rtl ? -2 : 2 }}>
                    <button className="w-full rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-canvas">
                      <div className="truncate text-sm font-medium text-gray-800">{p.name}</div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {p.subtitle} • {timeAgo(p.updatedAt)}
                      </div>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>

          {/* Bottom: Tools (dropdown), Providers, Settings */}
          <nav aria-label="Workspace" className="space-y-0.5 border-t border-line p-2">
            <ToolsDropdown />
            {secondaryNav.map(({ view: target, label, icon: Icon }) => (
              <motion.button
                key={target}
                onClick={() => go(target)}
                whileHover={{ x: rtl ? -2 : 2 }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  view === target ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-canvas'
                }`}
              >
                <Icon size={17} />
                {label}
              </motion.button>
            ))}
          </nav>
        </div>
      </motion.aside>
    </>
  );
}
