import React, { useState } from 'react';
import { X, Moon, Sun, Monitor, Shield, Trash2, Download, UserCheck, Sparkles } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'system' | 'dark' | 'light';
  onThemeChange: (theme: 'system' | 'dark' | 'light') => void;
  customInstructions: string;
  onSaveCustomInstructions: (instructions: string) => void;
  onClearAllChats: () => void;
  onExportData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  customInstructions,
  onSaveCustomInstructions,
  onClearAllChats,
  onExportData,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'personalization' | 'data' | 'about'>('general');
  const [instructions, setInstructions] = useState(customInstructions);
  const [savedMessage, setSavedMessage] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleSaveInstructions = () => {
    onSaveCustomInstructions(instructions);
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div
        className="relative w-full max-w-xl bg-white dark:bg-[#212121] text-neutral-800 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col md:flex-row max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left tabs menu */}
        <div className="w-full md:w-48 bg-neutral-50 dark:bg-[#171717] p-3 border-r border-neutral-200 dark:border-neutral-800 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible shrink-0">
          <div className="hidden md:block px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Settings
          </div>

          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'general'
                ? 'bg-neutral-200 dark:bg-[#2f2f2f] text-neutral-900 dark:text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>General</span>
          </button>

          <button
            onClick={() => setActiveTab('personalization')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'personalization'
                ? 'bg-neutral-200 dark:bg-[#2f2f2f] text-neutral-900 dark:text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Personalization</span>
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'data'
                ? 'bg-neutral-200 dark:bg-[#2f2f2f] text-neutral-900 dark:text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Data controls</span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left cursor-pointer ${
              activeTab === 'about'
                ? 'bg-neutral-200 dark:bg-[#2f2f2f] text-neutral-900 dark:text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>About</span>
          </button>
        </div>

        {/* Right content panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>

          {activeTab === 'general' && (
            <div className="space-y-6">
              <h2 id="settings-dialog-title" className="text-lg font-semibold text-inherit">General Settings</h2>

              <div>
                <label className="text-sm font-medium block mb-2 text-inherit">Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onThemeChange('light')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Sun className="w-4 h-4" />
                    <span>Light</span>
                  </button>

                  <button
                    onClick={() => onThemeChange('dark')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Moon className="w-4 h-4" />
                    <span>Dark</span>
                  </button>

                  <button
                    onClick={() => onThemeChange('system')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                      theme === 'system'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    <span>System</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Archived chats</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">View and restore previous conversations</div>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer">
                    Manage
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'personalization' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-inherit">Custom instructions</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                What would you like ChatGPT to know about you to provide better responses?
              </p>

              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="E.g., I am a software engineer building TypeScript apps. Keep responses concise, provide code snippets when helpful, and avoid unnecessary filler."
                rows={5}
                className="w-full p-3 rounded-xl bg-neutral-100 dark:bg-[#171717] border border-neutral-300 dark:border-neutral-700 text-sm outline-none focus:border-emerald-500 resize-none font-sans"
              />

              <div className="flex items-center justify-between pt-2">
                {savedMessage ? (
                  <span className="text-xs text-emerald-500 font-medium">Instructions saved!</span>
                ) : (
                  <span className="text-xs text-neutral-400">Applied to all new chats</span>
                )}
                <button
                  onClick={handleSaveInstructions}
                  className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:opacity-90 cursor-pointer"
                >
                  Save instructions
                </button>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-inherit">Data controls</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <div>
                    <div className="text-sm font-medium">Export data</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">Download your chats and profile data as JSON</div>
                  </div>
                  <button
                    onClick={onExportData}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20">
                  <div>
                    <div className="text-sm font-medium text-rose-600 dark:text-rose-400">Delete all chats</div>
                    <div className="text-xs text-rose-500/80">Permanently clears your chat history</div>
                  </div>
                  {confirmClear ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="px-2.5 py-1 rounded text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          onClearAllChats();
                          setConfirmClear(false);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete all</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-inherit">ChatGPT Web</h2>
              <div className="space-y-2 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                <p>
                  A faithful reproduction of the ChatGPT conversational interface designed for speed, clarity, and deep productivity.
                </p>
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-[#171717] space-y-1">
                  <div><strong>Version:</strong> ChatGPT 2026 Edition</div>
                  <div><strong>Engine:</strong> OpenAI Compatible & Gemini Powered Core</div>
                  <div><strong>Security:</strong> All chats stored locally in your browser session</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
