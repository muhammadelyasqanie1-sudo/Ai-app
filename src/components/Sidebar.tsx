import React, { useState, useRef, useEffect } from 'react';
import {
  PanelLeftClose,
  SquarePen,
  Search,
  Compass,
  MoreHorizontal,
  Pencil,
  Trash2,
  Share2,
  Settings,
  Sparkles,
  User,
  Check,
  X,
} from 'lucide-react';
import { OpenAiLogo } from './OpenAiLogo';
import { groupConversationsByDate, type Conversation } from '../utils/chatLogic';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onOpenSearchModal: () => void;
  onOpenExploreGpts: () => void;
  onOpenSettings: () => void;
  onOpenShareModal: (conversation: Conversation) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onOpenSearchModal,
  onOpenExploreGpts,
  onOpenSettings,
  onOpenShareModal,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const grouped = groupConversationsByDate(conversations);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setMenuOpenId(null);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col w-64 bg-[#f9f9f9] dark:bg-[#171717] border-r border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:-ml-64'
        }`}
        aria-label="Chat sidebar"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between p-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>

          <button
            onClick={onNewChat}
            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="New chat"
            title="New chat"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        </div>

        {/* Quick actions: Search & Explore GPTs */}
        <div className="px-3 pb-2 space-y-1">
          <button
            onClick={onOpenSearchModal}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
            aria-label="Search chats"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-neutral-400" />
              <span>Search chats</span>
            </div>
            <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-500">
              Ctrl K
            </span>
          </button>

          <button
            onClick={onOpenExploreGpts}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
            aria-label="Explore GPTs"
          >
            <Compass className="w-4 h-4 text-emerald-500" />
            <span>Explore GPTs</span>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-4">
          {conversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-neutral-400">
              No chat history yet. Start a new conversation!
            </div>
          ) : (
            Object.entries(grouped).map(([groupTitle, list]) => (
              <div key={groupTitle} className="space-y-0.5">
                <div className="px-3 py-1 text-[11px] font-semibold text-neutral-400 tracking-wider">
                  {groupTitle}
                </div>
                {list.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const isEditing = editingId === conv.id;

                  if (isEditing) {
                    return (
                      <div
                        key={conv.id}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-sm"
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(conv.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 bg-transparent border-none outline-none text-xs text-inherit"
                          autoFocus
                          aria-label="Edit chat title"
                        />
                        <button
                          onClick={() => handleSaveRename(conv.id)}
                          className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer"
                          aria-label="Confirm rename"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                          aria-label="Cancel rename"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer select-none ${
                        isActive
                          ? 'bg-neutral-200/90 dark:bg-neutral-800/90 font-medium text-neutral-900 dark:text-neutral-100'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'
                      }`}
                      onClick={() => onSelectConversation(conv.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSelectConversation(conv.id);
                      }}
                      aria-label={`Open conversation: ${conv.title}`}
                    >
                      <span className="truncate flex-1 pr-2">{conv.title}</span>

                      {/* Options menu button */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                          }}
                          className={`p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-opacity cursor-pointer ${
                            isActive || menuOpenId === conv.id
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                          aria-label="Conversation options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 text-neutral-500" />
                        </button>

                        {menuOpenId === conv.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-full mt-1 w-44 rounded-xl p-1 bg-white dark:bg-[#2f2f2f] shadow-lg border border-neutral-200 dark:border-neutral-700 z-50 text-neutral-700 dark:text-neutral-200 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                onOpenShareModal(conv);
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer text-left"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Share</span>
                            </button>
                            <button
                              onClick={() => handleStartRename(conv)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer text-left"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Rename</span>
                            </button>
                            <button
                              onClick={() => {
                                onDeleteConversation(conv.id);
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer text-left"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom user profile card */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
            aria-label="Settings and Profile"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              U
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">User</div>
              <div className="text-xs text-neutral-400 truncate">Free Plan</div>
            </div>
            <Settings className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </aside>
    </>
  );
};
