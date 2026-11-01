/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
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
        const verified = response.ok && data.verified === true &&
          Array.isArray(data.models) && data.capabilities &&
          typeof data.capabilities === 'object';
        if (!verified) {
          setAvailableModels([]);
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
          console.error('AFG_AI_CAPABILITIES_UNVERIFIED');
          return;
        }
        setAvailableModels(data.models);
        setSelectedModel((current) => data.models.includes(current) ? current : (data.models[0] || ''));
        setCapabilitySnapshot(data as AfgCapabilitySnapshot);
      })
      .catch(() => {
        setAvailableModels([]);
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
  const handleSendMessage = async (text: string, attachments: ChatAttachment[]) => {
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

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const assistantId = `ast-${Date.now()}`;
    const initialAssistantMessage: AfgMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, initialAssistantMessage]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          model: selectedModel,
          customInstructions: language === 'dari'
            ? 'پاسخ‌های شما باید به زبان فارسی/دری شیوا، دقیق و صمیمانه باشد و در صورت لزوم از شعرها یا نمونه‌های مرتبط با افغانستان استفاده نمایید.'
            : 'Respond insightfully, clearly, and supportively as the AFG AI assistant.',
        }),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          detail = payload.details || payload.error || detail;
        } catch {
          // Keep the HTTP status when the server response is not JSON.
        }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing response stream');
      const decoder = new TextDecoder();
      let fullContent = '';
      let streamFailed = false;
      let streamBuffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.type === 'content') {
                  fullContent += parsed.text;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId ? { ...m, content: fullContent } : m
                    )
                  );
                } else if (parsed.type === 'error') {
                  streamFailed = true;
                }
              } catch {
                // ignore SSE json parse error
              }
            }
          }
        }
      }

      if (streamFailed || !fullContent.trim()) throw new Error('Incomplete AI response');
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        )
      );
    } catch {
      const userFacingError = language === 'dari'
        ? 'درخواست انجام نشد. پیام شما در گفتگو باقی مانده است؛ لطفاً اتصال و مدل انتخاب‌شده را بررسی کرده و دوباره تلاش کنید.'
        : 'The request failed. Your message remains in this conversation; check the connection and selected model, then try again.';

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: userFacingError, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistoryChat = (session: AfgChatSession) => {
    setMessages(session.messages);
    setCurrentTab('chat');
  };

  const handleNewChat = () => {
    setMessages(INITIAL_MESSAGES);
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
            isLoading={isLoading}
            language={language}
            user={user}
            initialPrompt={initialPromptForChat}
            availableModels={availableModels}
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
