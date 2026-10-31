import React, { useState, useRef, useEffect } from 'react';
import {
  PanelLeft,
  ChevronDown,
  Sparkles,
  Zap,
  Brain,
  History,
  Share2,
  Lock,
  Plus,
  HelpCircle,
  Keyboard,
} from 'lucide-react';
import { OpenAiLogo } from './OpenAiLogo';

export type ModelType = 'gpt-4o' | 'gpt-4o-mini' | 'o1-reasoning';

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  selectedModel: ModelType;
  onSelectModel: (model: ModelType) => void;
  isTemporaryChat: boolean;
  onToggleTemporaryChat: () => void;
  onNewChat: () => void;
  onOpenShareModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenShortcuts: () => void;
  hasActiveMessages: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  selectedModel,
  onSelectModel,
  isTemporaryChat,
  onToggleTemporaryChat,
  onNewChat,
  onOpenShareModal,
  onOpenSettingsModal,
  onOpenShortcuts,
  hasActiveMessages,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getModelLabel = () => {
    switch (selectedModel) {
      case 'gpt-4o':
        return 'ChatGPT';
      case 'gpt-4o-mini':
        return 'GPT-4o mini';
      case 'o1-reasoning':
        return 'o1 Reasoning';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-3 bg-white/80 dark:bg-[#212121]/80 backdrop-blur-md transition-colors border-b border-transparent">
      {/* Left controls */}
      <div className="flex items-center gap-1">
        {!sidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Open sidebar"
            title="Open sidebar (Ctrl+Shift+S)"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onNewChat}
          className="p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          aria-label="New chat"
          title="New chat (Ctrl+Shift+O)"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* Model dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setModelDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-base text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-expanded={modelDropdownOpen}
            aria-haspopup="true"
            aria-label="Select AI Model"
          >
            <span>{getModelLabel()}</span>
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          </button>

          {modelDropdownOpen && (
            <div className="absolute left-0 mt-1 w-72 rounded-2xl p-2 bg-white dark:bg-[#2f2f2f] shadow-xl border border-neutral-200 dark:border-neutral-700 z-50 text-neutral-800 dark:text-neutral-200">
              <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase px-3 py-1.5">
                Model
              </div>

              <button
                onClick={() => {
                  onSelectModel('gpt-4o');
                  setModelDropdownOpen(false);
                }}
                className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                  selectedModel === 'gpt-4o' ? 'bg-neutral-100/70 dark:bg-neutral-800/70' : ''
                }`}
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold flex items-center justify-between">
                    <span>GPT-4o</span>
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Standard
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Great for most everyday tasks and coding
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  onSelectModel('gpt-4o-mini');
                  setModelDropdownOpen(false);
                }}
                className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                  selectedModel === 'gpt-4o-mini' ? 'bg-neutral-100/70 dark:bg-neutral-800/70' : ''
                }`}
              >
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">GPT-4o mini</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Fast and lightweight for everyday tasks
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  onSelectModel('o1-reasoning');
                  setModelDropdownOpen(false);
                }}
                className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                  selectedModel === 'o1-reasoning' ? 'bg-neutral-100/70 dark:bg-neutral-800/70' : ''
                }`}
              >
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Brain className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">o1 Reasoning</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Solves complex logic, math and deep coding problems
                  </div>
                </div>
              </button>

              <div className="my-1.5 border-t border-neutral-200 dark:border-neutral-700" />

              {/* Temporary chat toggle */}
              <button
                onClick={() => {
                  onToggleTemporaryChat();
                  setModelDropdownOpen(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-neutral-500" />
                  <span className="text-sm font-medium">Temporary chat</span>
                </div>
                <div
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                    isTemporaryChat ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                      isTemporaryChat ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {isTemporaryChat && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-200/80 dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <Lock className="w-3 h-3 text-neutral-500" />
            <span>Temporary</span>
          </div>
        )}

        {hasActiveMessages && (
          <button
            onClick={onOpenShareModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition-colors cursor-pointer text-neutral-700 dark:text-neutral-200"
            aria-label="Share chat"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
        )}

        {/* Keyboard shortcuts quick button */}
        <button
          onClick={onOpenShortcuts}
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          aria-label="Keyboard shortcuts (Ctrl+/)"
          title="Keyboard shortcuts (Ctrl+/)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* User avatar / profile button */}
        <button
          onClick={onOpenSettingsModal}
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-bold text-xs shadow-sm hover:ring-2 hover:ring-emerald-400/50 transition-all cursor-pointer"
          aria-label="Open settings"
          title="Settings & Personalization"
        >
          U
        </button>
      </div>
    </header>
  );
};
