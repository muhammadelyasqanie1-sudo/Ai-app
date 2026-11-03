import React, { useState } from 'react';
import { X, Keyboard, Search, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  description: string;
  keys: string[];
}

interface ShortcutGroup {
  category: string;
  shortcuts: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Chat & Messaging',
    shortcuts: [
      { description: 'Send message', keys: ['Enter'] },
      { description: 'Add new line', keys: ['Shift', 'Enter'] },
      { description: 'Stop response generation', keys: ['Esc'] },
      { description: 'Focus chat input', keys: ['/'] },
    ],
  },
  {
    category: 'Navigation & App',
    shortcuts: [
      { description: 'Open new chat', keys: ['Ctrl', 'Shift', 'O'] },
      { description: 'Toggle sidebar', keys: ['Ctrl', 'Shift', 'S'] },
      { description: 'Search chats', keys: ['Ctrl', 'K'] },
      { description: 'Open keyboard shortcuts', keys: ['Ctrl', '/'] },
      { description: 'Open AFG AI Terminal', keys: ['Ctrl', 'Shift', 'T'] },
      { description: 'Open settings', keys: ['Ctrl', ','] },
      { description: 'Close modals or menus', keys: ['Esc'] },
    ],
  },
  {
    category: 'Accessibility & Audio',
    shortcuts: [
      { description: 'Toggle Read Aloud speech', keys: ['Click 🔊'] },
      { description: 'Play / Pause Read Aloud', keys: ['Space'] },
      { description: 'Voice dictation input', keys: ['Click 🎤'] },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const formatKey = (key: string) => {
    if (isMac && key === 'Ctrl') return '⌘';
    if (isMac && key === 'Shift') return '⇧';
    if (isMac && key === 'Enter') return '↵';
    return key;
  };

  const filteredGroups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.filter((s) =>
      s.description.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.keys.some((k) => k.toLowerCase().includes(filterQuery.toLowerCase()))
    ),
  })).filter((group) => group.shortcuts.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#212121] text-neutral-800 dark:text-neutral-100 rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <Keyboard className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 id="shortcuts-dialog-title" className="text-base font-semibold">
                Keyboard shortcuts
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Press keys or combinations to perform quick actions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close keyboard shortcuts dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar inside modal */}
        <div className="px-6 py-3 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-[#1a1a1a]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-neutral-700">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="flex-1 bg-transparent border-none outline-none text-xs text-neutral-800 dark:text-neutral-200 placeholder-neutral-400"
              aria-label="Filter keyboard shortcuts"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No shortcuts found matching &quot;{filterQuery}&quot;
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category} className="space-y-2">
                <div className="text-[11px] font-semibold text-neutral-400 tracking-wider uppercase">
                  {group.category}
                </div>

                <div className="space-y-1">
                  {group.shortcuts.map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors text-xs"
                    >
                      <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                        {shortcut.description}
                      </span>

                      <div className="flex items-center gap-1 select-none">
                        {shortcut.keys.map((k, kIdx) => (
                          <React.Fragment key={kIdx}>
                            <kbd className="min-w-[22px] text-center px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 font-mono text-[11px] shadow-2xs">
                              {formatKey(k)}
                            </kbd>
                            {kIdx < shortcut.keys.length - 1 && (
                              <span className="text-[10px] text-neutral-400 font-sans">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer tip */}
        <div className="px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#1a1a1a] flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-1.5">
            <Command className="w-3.5 h-3.5 text-neutral-400" />
            <span>Press <kbd className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-mono text-[10px]">Ctrl</kbd> + <kbd className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-mono text-[10px]">/</kbd> anytime to toggle</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
