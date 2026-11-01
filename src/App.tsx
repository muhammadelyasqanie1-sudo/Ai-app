/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AfgHeader } from './components/afg/AfgHeader';
import { AfgNavigation } from './components/afg/AfgNavigation';
import { AfgHomeView } from './components/afg/AfgHomeView';
import { AfgChatView } from './components/afg/AfgChatView';
import { AfgImageGenView } from './components/afg/AfgImageGenView';
import { AfgVideoGenView } from './components/afg/AfgVideoGenView';
import { AfgToolsCenter } from './components/afg/AfgToolsCenter';
import { AfgHistoryView } from './components/afg/AfgHistoryView';
import { AfgSettingsView } from './components/afg/AfgSettingsView';
import { AfgAdminPanel } from './components/afg/AfgAdminPanel';
import { AfgSideMenu } from './components/afg/AfgSideMenu';
import { AfgLanguageModal } from './components/afg/AfgLanguageModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';

import type { 
  Language, 
  Theme, 
  TabType, 
  UserProfile, 
  AfgMessage, 
  ChatAttachment, 
  AfgChatSession,
  AfgCapabilitySnapshot,
  AfgModelOption,
} from './types/afg';

const DEFAULT_USER: UserProfile = {
  name: 'Guest',
  nameEn: 'Guest',
  email: '',
  avatar: '',
  isPremium: false,
  tier: 'Free',
};

const INITIAL_MESSAGES: AfgMessage[] = [
  {
    id: 'seed-welcome-1',
    role: 'assistant',
    content: `سلام! 👋 به **AFG AI** خوش آمدید.

گفت‌وگوی متنی با مدل‌های تأییدشده زمانی در دسترس است که ارائه‌دهنده در سرور پیکربندی و بررسی شده باشد. قابلیت‌های دیگر فعلاً غیرفعال‌اند.

چگونه می‌توانم کمک کنم؟ 🇦🇫❤️`,
    timestamp: Date.now() - 1000 * 60 * 10,
  },
];

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export default function App() {
  // App State
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('afg_language');
    return (saved === 'dari' || saved === 'english') ? saved : 'dari';
  });

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('afg_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'dark';
  });

  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [user, setUser] = useState<UserProfile>(DEFAULT_USER);
  const [messages, setMessages] = useState<AfgMessage[]>(INITIAL_MESSAGES);
  const [currentSessionId, setCurrentSessionId] = useState(() => `chat-${Date.now()}`);
  const [isLoading, setIsLoading] = useState(false);
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<AfgModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [capabilitySnapshot, setCapabilitySnapshot] = useState<AfgCapabilitySnapshot>({
    verified: false,
    models: [],
    capabilities: {
      chat: false,
      vision: false,
      'image-generation': false,
      'video-generation': false,
      'file-processing': false,
      'speech-to-text': false,
      'text-to-speech': false,
      research: false,
    },
  });
  const [initialPromptForChat, setInitialPromptForChat] = useState<string | undefined>(undefined);

  // Modals state
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Sync RTL and Dark Mode with DOM
  useEffect(() => {
    document.documentElement.dir = language === 'dari' ? 'rtl' : 'ltr';
    document.documentElement.lang = language === 'dari' ? 'fa' : 'en';
    localStorage.setItem('afg_language', language);
  }, [language]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('afg_theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/capabilities`)
      .then(async (response) => {
        const data = await response.json();
        const options: AfgModelOption[] = Array.isArray(data.modelDescriptors) ? data.modelDescriptors : [];
        const verified = response.ok && data.verified === true &&
          Array.isArray(data.models) && data.capabilities &&
          typeof data.capabilities === 'object';
        setModelOptions(options);
        if (!verified) {
          setAvailableModels([]);
          setSelectedModel('');
          setCapabilitySnapshot({
            verified: false,
            models: [],
            modelDescriptors: options,
            capabilities: {
              chat: false,
              vision: false,
              'image-generation': false,
              'video-generation': false,
              'file-processing': false,
              'speech-to-text': false,
              'text-to-speech': false,
              research: false,
            },
          });
          console.error('AFG_AI_CAPABILITIES_UNVERIFIED');
          return;
        }
        setAvailableModels(data.models);
        setSelectedModel((current) => data.models.includes(current) ? current : (data.models[0] || ''));
        setCapabilitySnapshot(data as AfgCapabilitySnapshot);
      })
      .catch(() => {
        setAvailableModels([]);
        setModelOptions([]);
        setSelectedModel('');
        setCapabilitySnapshot({
          verified: false,
          models: [],
          capabilities: {
            chat: false,
            vision: false,
            'image-generation': false,
            'video-generation': false,
            'file-processing': false,
            'speech-to-text': false,
            'text-to-speech': false,
            research: false,
          },
        });
        console.error('AFG_AI_CAPABILITIES_UNAVAILABLE');
      });
  }, []);

  useEffect(() => {
    if (!messages.some((message) => message.role === 'user')) return;
    try {
      const stored = JSON.parse(localStorage.getItem('afg_sessions') || '[]');
      const sessions = Array.isArray(stored) ? stored : [];
      const firstUser = messages.find((message) => message.role === 'user');
      const latest = [...messages].reverse().find((message) => message.role === 'user' || (message.role === 'assistant' && message.content.trim()));
      const session = {
        id: currentSessionId,
        title: (firstUser?.content || 'New chat').replace(/\\s+/g, ' ').slice(0, 64),
        lastMessage: latest?.content.slice(0, 180) || '',
        timestamp: Date.now(),
        messages,
        category: 'general',
      };
      localStorage.setItem('afg_sessions', JSON.stringify([session, ...sessions.filter((item: any) => item?.id !== currentSessionId)].slice(0, 200)));
    } catch { console.error('AFG_AI_LOCAL_HISTORY_SAVE_FAILED'); }
  }, [messages, currentSessionId]);

  // Global Keyboard Shortcuts (Ctrl+/ or Cmd+/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsSideMenuOpen(false);
        setIsLanguageModalOpen(false);
        setIsShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleLanguage = () => {
    setLanguage(prev => (prev === 'dari' ? 'english' : 'dari'));
  };

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleStartChatWithPrompt = (promptText: string) => {
    setCurrentTab('chat');
    handleSendMessage(promptText, []);
  };

  // Chat message sending & streaming logic
  const handleSendMessage = async (text: string, attachments: ChatAttachment[], baseMessages: AfgMessage[] = messages) => {
    if (!text.trim() && attachments.length === 0) return;
    if (!selectedModel) {
      setCurrentTab('chat');
      setMessages((previous) => [...previous, {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }, {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: language === 'dari' ? 'هیچ مدل چت تأییدشده‌ای در دسترس نیست. پس از تنظیم ارائه‌دهنده دوباره تلاش کنید.' : 'No verified chat model is available. Configure the provider and try again.',
        timestamp: Date.now(),
      }]);
      return;
    }

    const userMessage: AfgMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
    };

    setMessages(baseMessages.concat(userMessage));
    setIsLoading(true);
    const abortController = new AbortController();
    activeChatAbortRef.current = abortController;

    const assistantId = `ast-${Date.now()}`;
    const initialAssistantMessage: AfgMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, initialAssistantMessage]);

    let fullContent = '';
    try {
      let streamCompleted = false;
      for (let attempt = 0; attempt < 3 && !streamCompleted; attempt++) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [...baseMessages, userMessage].map((m) => ({ role: m.role, content: m.content })),
              model: selectedModel,
              customInstructions: language === 'dari'
                ? 'پاسخ‌های شما باید به زبان فارسی/دری شیوا، دقیق و صمیمانه باشد. درباره عدم قطعیت صادق باشید و منبع یا نقل‌قول ساختگی ارائه نکنید.'
                : 'Respond clearly and supportively. Be honest about uncertainty and never invent sources or citations.',
            }),
            signal: abortController.signal,
          });
          if (!response.ok) {
            if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
              continue;
            }
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `HTTP ${response.status}`);
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Missing response stream');
          const decoder = new TextDecoder();
          let streamFailed = false;
          let streamBuffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.type === 'content' && typeof parsed.text === 'string') {
                  fullContent += parsed.text;
                  setMessages((previous) => previous.map((message) => message.id === assistantId ? { ...message, content: fullContent } : message));
                } else if (parsed.type === 'error') { streamFailed = true; }
              } catch { /* Ignore malformed individual SSE events. */ }
            }
          }
          if (streamFailed || !fullContent.trim()) throw new Error('The AI returned an empty or interrupted response.');
          streamCompleted = true;
        } catch (error) {
          if (abortController.signal.aborted || fullContent.trim() || attempt >= 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
        }
      }
      if (!streamCompleted) throw new Error('The AI response could not be completed.');
      setMessages((previous) => previous.map((message) => message.id === assistantId ? { ...message, isStreaming: false } : message));
    } catch {
      const userFacingError = language === 'dari'
        ? 'پاسخ کامل نشد. پیام شما باقی مانده است؛ اتصال و مدل را بررسی کرده و دوباره تلاش کنید.'
        : 'The response could not be completed. Your prompt is preserved; check the connection and model, then retry.';

      if (abortController.signal.aborted) {
        setMessages(prev => prev.filter((message) => message.id !== assistantId));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: fullContent.trim() ? `${fullContent}\n\n${userFacingError}` : userFacingError, isStreaming: false, isError: true, retryable: true } : m
        ));
      }
    } finally {
      if (activeChatAbortRef.current === abortController) activeChatAbortRef.current = null;
      setIsLoading(false);
    }
  };

  const handleEditMessage = (messageId: string, editedText: string) => {
    const index = messages.findIndex((message) => message.id === messageId && message.role === 'user');
    if (index < 0 || !editedText.trim()) return;
    const original = messages[index];
    const context = messages.slice(0, index);
    setMessages(context);
    void handleSendMessage(editedText.trim(), original.attachments || [], context);
  };

  const handleBranchMessage = (messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    setCurrentSessionId(`chat-${Date.now()}`);
    setMessages(messages.slice(0, index + 1));
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages((previous) => previous.filter((message) => message.id !== messageId));
  };

  const handleStopGeneration = () => activeChatAbortRef.current?.abort();

  const handleRetryMessage = (messageId: string) => {
    const targetIndex = messages.findIndex((message) => message.id === messageId);
    if (targetIndex < 0) return;
    let userIndex = -1;
    for (let index = targetIndex - 1; index >= 0; index--) {
      if (messages[index].role === 'user') { userIndex = index; break; }
    }
    if (userIndex < 0) return;
    const userMessage = messages[userIndex];
    const context = messages.slice(0, userIndex);
    setMessages(context);
    void handleSendMessage(userMessage.content, userMessage.attachments || [], context);
  };

  const handleSelectHistoryChat = (session: AfgChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setCurrentTab('chat');
  };

  const handleNewChat = () => {
    setCurrentSessionId(`chat-${Date.now()}`);
    setMessages([]);
    setCurrentTab('chat');
  };

  return (
    <div className={`min-h-screen w-full flex flex-col transition-colors duration-200 ${theme === 'dark' ? 'bg-[#060b18] text-slate-100' : 'bg-[#f4f7fc] text-slate-900'}`}>
      
      {/* AFG AI Header */}
      <AfgHeader
        language={language}
        theme={theme}
        user={user}
        onToggleLanguage={handleToggleLanguage}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setCurrentTab('settings')}
        onOpenMenu={() => setIsSideMenuOpen(true)}
      />

      {/* AFG AI Navigation (Mobile bottom bar + desktop bar) */}
      <AfgNavigation
        currentTab={currentTab}
        onChangeTab={setCurrentTab}
        language={language}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full pb-20 md:pb-8 pt-2">
        {currentTab === 'home' && (
          <AfgHomeView
            language={language}
            user={user}
            onChangeTab={setCurrentTab}
            onStartChatWithPrompt={handleStartChatWithPrompt}
            capabilities={capabilitySnapshot.capabilities}
          />
        )}

        {currentTab === 'chat' && (
          <AfgChatView
            messages={messages}
            onSendMessage={handleSendMessage}
            onStop={handleStopGeneration}
            onRetryMessage={handleRetryMessage}
            onEditMessage={handleEditMessage}
            onBranchMessage={handleBranchMessage}
            onDeleteMessage={handleDeleteMessage}
            isLoading={isLoading}
            language={language}
            user={user}
            initialPrompt={initialPromptForChat}
            availableModels={availableModels}
            modelOptions={modelOptions}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            capabilities={capabilitySnapshot.capabilities}
          />
        )}

        {currentTab === 'image-gen' && (
          <AfgImageGenView
            language={language}
          />
        )}

        {currentTab === 'video-gen' && (
          <AfgVideoGenView
            language={language}
          />
        )}

        {currentTab === 'tools' && (
          <AfgToolsCenter language={language} />
        )}

        {currentTab === 'history' && (
          <AfgHistoryView
            language={language}
            onSelectChat={handleSelectHistoryChat}
            onNewChat={handleNewChat}
          />
        )}


        {currentTab === 'settings' && (
          <AfgSettingsView
            language={language}
            theme={theme}
            user={user}
            onToggleLanguage={handleToggleLanguage}
            onToggleTheme={handleToggleTheme}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        )}

        {currentTab === 'admin' && (
          <AfgAdminPanel language={language} />
        )}
      </main>


      {/* Slide-over Side Menu Drawer */}
      <AfgSideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        currentTab={currentTab}
        onChangeTab={setCurrentTab}
        language={language}
        user={user}
      />

      {/* Language Picker Modal */}
      <AfgLanguageModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        language={language}
        onSelectLanguage={(lang) => {
          setLanguage(lang);
          setIsLanguageModalOpen(false);
        }}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

    </div>
  );
}
