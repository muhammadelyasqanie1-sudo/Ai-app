/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { AfgHeader } from './components/afg/AfgHeader';
import { AfgHomeView } from './components/afg/AfgHomeView';
import { AfgChatView } from './components/afg/AfgChatView';
import { AfgSideMenu } from './components/afg/AfgSideMenu';
import { AfgLanguageModal } from './components/afg/AfgLanguageModal';
import { AfgCinematicIntro } from './components/afg/AfgCinematicIntro';
import { AfgCommandPalette, type AfgSystemFeatures } from './components/afg/AfgCommandPalette';
import { AfgAuthGate } from './components/afg/AfgAuthGate';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ErrorBoundary } from './components/afg/AfgDesignSystem';
import { applyDocumentLocale } from './utils/i18n';
import { apiFetch } from './lib/apiClient';
import { useAlwaysLiveConnection } from './hooks/useAlwaysLiveConnection';

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

const LazyAfgOfflineHubView = React.lazy(() =>
  import('./components/afg/AfgOfflineHubView').then((module) => ({ default: module.AfgOfflineHubView })),
);
const LazyAfgImageGenView = React.lazy(() => import('./components/afg/AfgImageGenView').then((module) => ({ default: module.AfgImageGenView })));
const LazyAfgVideoGenView = React.lazy(() => import('./components/afg/AfgVideoGenView').then((module) => ({ default: module.AfgVideoGenView })));
const LazyAfgToolsCenter = React.lazy(() => import('./components/afg/AfgToolsCenter').then((module) => ({ default: module.AfgToolsCenter })));
const LazyAfgHistoryView = React.lazy(() => import('./components/afg/AfgHistoryView').then((module) => ({ default: module.AfgHistoryView })));
const LazyAfgSettingsView = React.lazy(() => import('./components/afg/AfgSettingsView').then((module) => ({ default: module.AfgSettingsView })));
const LazyAfgAdminPanel = React.lazy(() => import('./components/afg/AfgAdminPanel').then((module) => ({ default: module.AfgAdminPanel })));
const LazyAfgTerminalView = React.lazy(() => import('./components/afg/AfgTerminalView').then((module) => ({ default: module.AfgTerminalView })));
const LazyAfgOfflineView = React.lazy(() => import('./components/afg/AfgOfflineView').then((module) => ({ default: module.AfgOfflineView })));


const DEFAULT_USER: UserProfile = {
  name: 'Guest',
  nameEn: 'Guest',
  email: '',
  avatar: '',
  isPremium: false,
  tier: 'Free',
};

const INITIAL_MESSAGES: AfgMessage[] = [];

const detectDeviceLanguage = (): Language => {
  const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language])
    .map((tag) => tag.toLowerCase());
  const first = preferred[0] || 'fa';
  if (first.startsWith('fa-af') || first.startsWith('prs')) return 'dari';
  if (first.startsWith('fa-ir')) return 'persian';
  const code = first.split('-')[0];
  const languageMap: Record<string, Language> = {
    en:'english', fa:'persian', prs:'dari', ps:'pashto', ar:'arabic', ur:'urdu',
    tr:'turkish', ru:'russian', fr:'french', es:'spanish', de:'german',
    zh:'chinese', hi:'hindi', bn:'bengali', id:'indonesian', pt:'portuguese',
    ja:'japanese', ko:'korean',
  };
  return languageMap[code] || 'dari';
};

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export default function App() {
  useAlwaysLiveConnection();
  // App State
  const [language, setLanguage] = useState<Language>(() => { const saved = localStorage.getItem('afg_language'); const supported: Language[] = ['dari','english','pashto','persian','arabic','urdu','turkish','russian','french','spanish','german','chinese','hindi','bengali','indonesian','portuguese','japanese','korean']; return supported.includes(saved as Language) ? saved as Language : detectDeviceLanguage(); });
  // Language is detected from the device/browser; no manual language gate on startup.
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState(true);
  // Show the full-screen cinematic motion intro on every fresh app launch.
  const [isIntroVisible, setIsIntroVisible] = useState(true);
  const [hasEnteredApp, setHasEnteredApp] = useState(() => localStorage.getItem('afg_entry_mode') === 'guest');
  const [authCheckResolved, setAuthCheckResolved] = useState(false);
  const [isInitialChatLoading, setIsInitialChatLoading] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [chatLoadAttempt, setChatLoadAttempt] = useState(0);

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('afg_theme');
    return (saved === 'dark' || saved === 'light' || saved === 'neon' || saved === 'system') ? saved : 'system';
  });

  const [currentTab, setCurrentTab] = useState<TabType>('chat');
  const [user, setUser] = useState<UserProfile>(DEFAULT_USER);
  const [messages, setMessages] = useState<AfgMessage[]>(INITIAL_MESSAGES);
  const [currentSessionId, setCurrentSessionId] = useState(() => `chat-${Date.now()}`);
  const [isLoading, setIsLoading] = useState(false);
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const serverConversationRef = useRef<string | null>(null);
  const wasAuthenticatedRef = useRef(false);
  const localeChangedThisSession = useRef(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<AfgModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [capabilitySnapshot, setCapabilitySnapshot] = useState<AfgCapabilitySnapshot>({
    verified: false,
    models: [],
    capabilities: {
      chat: false,
      vision: false,
      ocr: false,
      'image-edit': false,
      'image-generation': false,
      'video-generation': false,
      'file-processing': false,
      'speech-to-text': false,
      'text-to-speech': false,
      research: false,
    },
  });
  const [initialPromptForChat, setInitialPromptForChat] = useState<string | undefined>(undefined);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<'minimal' | 'standard' | 'deep'>(() => (localStorage.getItem('afg_thinking_level') as any) || 'standard');
  const [planMode, setPlanMode] = useState(() => localStorage.getItem('afg_plan_mode') === 'true');
  const [dualPlanning, setDualPlanning] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState<'ask' | 'guided' | 'full'>(() => (localStorage.getItem('afg_permission_level') as any) || 'guided');
  const [chatFindQuery, setChatFindQuery] = useState('');
  const [systemFeatures, setSystemFeatures] = useState<AfgSystemFeatures>({ voice_stt_enabled:false, terminal_exec_enabled:false, github_connected:false, web_preview_enabled:false, file_upload_enabled:false, dual_planning_enabled:false, undo_file_changes_enabled:false });
  const [announcements, setAnnouncements] = useState<Array<{id:string;title:string;body:string;created_at:string}>>([]);

  useEffect(() => {
    let active = true;
    fetch(API_BASE_URL + '/api/announcements', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (active) setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []); })
      .catch(() => { if (active) setAnnouncements([]); });
    return () => { active = false; };
  }, []);

  // Modals state
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Sync RTL and Dark Mode with DOM
  useEffect(() => {
    if (!hasSelectedLanguage) return;
    applyDocumentLocale(language);
    localStorage.setItem('afg_language', language);
  }, [language, hasSelectedLanguage]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.classList.toggle('dark', resolved === 'dark' || resolved === 'neon');
      document.documentElement.classList.toggle('light', resolved === 'light');
      document.documentElement.classList.toggle('neon', resolved === 'neon');
    };
    applyTheme();
    localStorage.setItem('afg_theme', theme);
    if (theme === 'system') media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    fetch(API_BASE_URL + '/api/system/features', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data?.features) setSystemFeatures((current) => ({ ...current, ...data.features })); })
      .catch(() => { if (active) setSystemFeatures((current) => ({ ...current, voice_stt_enabled:false, terminal_exec_enabled:false })); });
    return () => { active = false; };
  }, []);

  useEffect(() => { localStorage.setItem('afg_thinking_level', thinkingLevel); }, [thinkingLevel]);
  useEffect(() => { localStorage.setItem('afg_plan_mode', String(planMode)); }, [planMode]);
  useEffect(() => { localStorage.setItem('afg_permission_level', permissionLevel); }, [permissionLevel]);

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
          setSelectedModel('auto');
          setCapabilitySnapshot({
            verified: false,
            models: [],
            modelDescriptors: options,
            capabilities: {
              chat: false,
              vision: false,
              ocr: false,
              'image\u002dedit': false,
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
        fetch(API_BASE_URL + '/api/auth/me', { credentials: 'include' })
          .then((authResponse) => authResponse.ok ? authResponse.json() : null)
          .then(async (authData) => {
            if (!authData?.authenticated) return;
            const preferencesResponse = await fetch(API_BASE_URL + '/api/account/preferences', { credentials: 'include' });
            const preferencesData = preferencesResponse.ok ? await preferencesResponse.json() : null;
            if (preferencesData?.preferences?.auto_select_model === false) { setSelectedModel('auto'); return; }
            const preferred = authData?.user?.defaultModel || preferencesData?.preferences?.default_model;
            if (typeof preferred === 'string' && data.models.includes(preferred)) setSelectedModel(preferred);
          }).catch(() => {});
      })
      .catch(() => {
        setAvailableModels([]);
        setModelOptions([]);
        setSelectedModel('auto');
        setCapabilitySnapshot({
          verified: false,
          models: [],
          capabilities: {
            chat: false,
            vision: false,
            ocr: false,
            'image\u002dedit': false,
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
    if (user.email) return;
    try {
      const stored = JSON.parse(localStorage.getItem('afg_sessions') || '[]');
      const sessions = Array.isArray(stored) ? stored : [];
      if (!messages.some((message) => message.role === 'user')) {
        localStorage.setItem('afg_sessions', JSON.stringify(sessions.filter((item: any) => item?.id !== currentSessionId)));
        return;
      }
      const firstUser = messages.find((message) => message.role === 'user');
      const existingSession = sessions.find((item: any) => item?.id === currentSessionId);
      const latest = [...messages].reverse().find((message) => message.role === 'user' || (message.role === 'assistant' && message.content.trim()));
      const session = {
        id: currentSessionId,
        title: existingSession?.title || (firstUser?.content || 'New chat').replace(/\\s+/g, ' ').slice(0, 64),
        isPinned: Boolean(existingSession?.isPinned),
        category: existingSession?.category || 'general',
        lastMessage: latest?.content.slice(0, 180) || '',
        timestamp: Date.now(),
        messages,
      };
      localStorage.setItem('afg_sessions', JSON.stringify([session, ...sessions.filter((item: any) => item?.id !== currentSessionId)].slice(0, 200)));
    } catch { console.error('AFG_AI_LOCAL_HISTORY_SAVE_FAILED'); }
  }, [messages, currentSessionId, user.email]);

  const handleSelectModel = (model: string) => {
    setSelectedModel(model);
    const csrf = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '';
    fetch(API_BASE_URL + '/api/auth/preferences', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
      body: JSON.stringify({ defaultModel: model === 'auto' ? '' : model }),
    }).catch(() => {});
  };

  useEffect(() => {
    const syncAccount = () => {
      fetch(API_BASE_URL + '/api/auth/me', { credentials: 'include' })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (data?.authenticated && data.user) {
            wasAuthenticatedRef.current = true;
            setHasEnteredApp(true);
            localStorage.setItem('afg_entry_mode', 'account');
            setUser({ name: data.user.displayName || 'User', nameEn: data.user.displayName || 'User', email: data.user.email || '', avatar: '', isPremium: false, tier: 'Free' });
            fetch(API_BASE_URL + '/api/account/preferences', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((prefs) => { const saved=prefs?.preferences; if(saved?.appearance&&['light','dark','neon','system'].includes(saved.appearance))setTheme(saved.appearance); if(localeChangedThisSession.current){const chosen=localStorage.getItem('afg_language')||'dari';const csrf=document.cookie.split('; ').find((item)=>item.startsWith('afg_csrf='))?.slice('afg_csrf='.length)||'';void fetch(API_BASE_URL+'/api/account/locale',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf)},body:JSON.stringify({locale:chosen})}).catch(()=>console.warn('AFG_LOCALE_PREFERENCE_SAVE_FAILED'));} document.documentElement.style.fontSize=String(saved?.font_size||14)+'px'; const accentMap:Record<string,string>={cyan:'#00e5ff',blue:'#3b82f6',violet:'#8b5cf6',emerald:'#10b981',rose:'#f43f5e'}; document.documentElement.style.setProperty('--accent-cyan',accentMap[saved?.accent_color]||accentMap.cyan); document.documentElement.dataset.afgDensity=saved?.density||'comfortable'; document.documentElement.dataset.afgChatWidth=saved?.chat_width||'comfortable'; document.documentElement.classList.toggle('afg-reduce-motion',saved?.animations_enabled===false); localStorage.setItem('afg_voice_enabled',String(saved?.voice_enabled!==false)); window.dispatchEvent(new Event('afg-voice-preference-change')); if(saved?.auto_select_model===false){setSelectedModel('auto');return;} const model=saved?.default_model; if(typeof model==='string'&&model)setSelectedModel(model); }).catch(() => {});
          } else {
            if (wasAuthenticatedRef.current) {
              wasAuthenticatedRef.current = false;
              serverConversationRef.current = null;
              setMessages([]);
              setCurrentSessionId(`chat-${Date.now()}`);
            }
            setUser(DEFAULT_USER);
            localStorage.removeItem('afg_voice_enabled');
            window.dispatchEvent(new Event('afg-voice-preference-change'));
          }
        }).catch(() => {}).finally(() => setAuthCheckResolved(true));
    };
    const handleSignOut = () => {
      wasAuthenticatedRef.current = false;
      serverConversationRef.current = null;
      setMessages([]);
      setCurrentSessionId(`chat-${Date.now()}`);
      setUser(DEFAULT_USER);
      setCurrentTab('chat');
      setHasEnteredApp(false);
      setAuthCheckResolved(true);
      localStorage.removeItem('afg_entry_mode');
    };
    window.addEventListener('afg-auth-change', syncAccount);
    window.addEventListener('afg-preferences-change', syncAccount);
    window.addEventListener('afg-signout', handleSignOut);
    syncAccount();
    return () => { window.removeEventListener('afg-auth-change', syncAccount); window.removeEventListener('afg-preferences-change', syncAccount); window.removeEventListener('afg-signout', handleSignOut); };
  }, []);

  useEffect(() => {
    if (!user.email || !hasEnteredApp) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setIsInitialChatLoading(true);
    setProfileLoadError('');
    const load = async () => {
      try {
        const [profileResponse, historyResponse] = await Promise.all([
          fetch(API_BASE_URL + '/api/auth/me', { credentials:'include', cache:'no-store', signal:controller.signal }),
          fetch(API_BASE_URL + '/api/conversations', { credentials:'include', cache:'no-store', signal:controller.signal }),
        ]);
        if (!profileResponse.ok || !historyResponse.ok) throw new Error('Profile or history request failed');
        const profile = await profileResponse.json();
        const history = await historyResponse.json();
        if (!profile?.authenticated || !profile?.user) throw new Error('Profile unavailable');
        if (!active) return;
        setUser((current) => ({ ...current, name:profile.user.displayName || current.name, nameEn:profile.user.displayName || current.nameEn, email:profile.user.email || current.email, avatar:profile.user.avatarUrl || current.avatar }));
        const conversations = Array.isArray(history?.conversations) ? history.conversations : [];
        if (conversations.length) {
          const latest = conversations[0];
          const messagesResponse = await fetch(API_BASE_URL + '/api/conversations/' + encodeURIComponent(latest.id) + '/messages', { credentials:'include', cache:'no-store', signal:controller.signal });
          if (!messagesResponse.ok) throw new Error('Chat history unavailable');
          const payload = await messagesResponse.json();
          if (!active) return;
          const restored: AfgMessage[] = (Array.isArray(payload?.messages) ? payload.messages : [])
            .filter((item: any) => item?.role === 'user' || item?.role === 'assistant')
            .map((item: any) => ({ id:String(item.id), role:item.role, content:String(item.content || ''), timestamp:item.createdAt ? new Date(item.createdAt).getTime() : Date.now(), isError:item.status === 'failed' }));
          setMessages(restored);
          setCurrentSessionId(String(latest.id));
          serverConversationRef.current = String(latest.id);
        }
      } catch {
        if (active) setProfileLoadError(language === 'dari' ? 'بارگذاری پروفایل یا تاریخچه ناموفق بود. لطفاً دوباره تلاش کنید.' : 'Failed to load profile. Please try again.');
      } finally {
        window.clearTimeout(timer);
        if (active) setIsInitialChatLoading(false);
      }
    };
    void load();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [user.email, hasEnteredApp, language, chatLoadAttempt]);

  useEffect(() => {
    serverConversationRef.current = null;
  }, [user.email]);

  const getCsrfHeaders = (): Record<string, string> => {
    const token = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '';
    return token ? { 'X-CSRF-Token': decodeURIComponent(token) } : {};
  };

  const ensureServerConversation = async (title: string, seedMessages: AfgMessage[] = []): Promise<string> => {
    if (serverConversationRef.current) return serverConversationRef.current;
    const response = await apiFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
      body: JSON.stringify({ title: title.trim().replace(/\\s+/g, ' ').slice(0, 64) || 'New chat', model: selectedModel || 'auto' }),
    });
    const payload = await response.json() as { conversation?: { id?: string } };
    if (!payload.conversation?.id) throw new Error('Conversation creation returned no ID.');
    serverConversationRef.current = payload.conversation.id;
    setCurrentSessionId(payload.conversation.id);
    for (const message of seedMessages) {
      if ((message.role === 'user' || message.role === 'assistant') && message.content.trim()) {
        await persistServerMessage(payload.conversation.id, message.role, message.content, message.isError ? 'failed' : 'complete', message.id);
      }
    }
    return payload.conversation.id;
  };

  const persistServerMessage = async (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    status: 'complete' | 'failed' = 'complete',
    messageId?: string,
  ) => {
    const clientMessageId = messageId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)
      ? messageId
      : crypto.randomUUID();
    await apiFetch('/api/conversations/' + encodeURIComponent(conversationId) + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
      body: JSON.stringify({ role, content: content.slice(0, 50_000), model: selectedModel || null, status, clientMessageId }),
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setIsSideMenuOpen(false);
        if (systemFeatures.terminal_exec_enabled) setCurrentTab('terminal');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((previous) => !previous);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsSideMenuOpen(false);
        setIsShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [systemFeatures.terminal_exec_enabled]);

  const handleSetLanguage = (nextLanguage: Language) => {
    localeChangedThisSession.current = true;
    setLanguage(nextLanguage);
    setHasSelectedLanguage(true);
    setIsIntroVisible(false);
    localStorage.setItem('afg_language', nextLanguage);
    applyDocumentLocale(nextLanguage);
    fetch(API_BASE_URL + '/api/auth/me', { credentials: 'include' }).then((response) => response.ok ? response.json() : null).then((authData) => {
      if (!authData?.authenticated) return;
      const csrf = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '';
      return fetch(API_BASE_URL + '/api/account/locale', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
        body: JSON.stringify({ locale: nextLanguage }),
      }).then((response) => { if (!response.ok) throw new Error('Locale preference save failed'); });
    }).catch(() => console.warn('AFG_LOCALE_PREFERENCE_SAVE_FAILED'));
  };

  const handleToggleLanguage = () => handleSetLanguage(language === 'dari' ? 'english' : 'dari');

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleStartChatWithPrompt = (promptText: string) => {
    setCurrentTab('chat');
    handleSendMessage(promptText, []);
  };

  // Chat message sending & streaming logic
  const handleSendMessage = async (text: string, attachments: ChatAttachment[], baseMessages: AfgMessage[] = messages, toolOptions: Record<string, unknown> = {}) => {
    if (!text.trim() && attachments.length === 0) return;
    if (attachments.length > 0) {
      const hasImage = attachments.some((attachment) => /\\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.name));
      const selectedDescriptor = modelOptions.find((item) => selectedModel.endsWith(item.id));
      if (hasImage && !selectedDescriptor?.capabilities?.vision) {
        window.alert(language === 'dari' ? 'این مدل نمی‌تواند تصویر را بخواند. لطفاً یک مدل دارای قابلیت Vision انتخاب کنید.' : 'This model cannot read images. Please switch to a Vision model.');
      } else {
        window.alert(language === 'dari' ? 'بارگذاری فایل هنوز به ذخیره‌سازی و پردازش سرور وصل نشده است.' : 'File uploads are not connected to server storage and processing yet.');
      }
      return;
    }
    // Use server-side automatic selection when no model is selected or the catalog is temporarily unavailable.
    const modelToUse = selectedModel || 'auto';

    const userMessage: AfgMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
    };

    setMessages(baseMessages.concat(userMessage));
    setIsLoading(true);
    let persistedConversationId: string | null = null;
    let userMessagePersisted = false;
    if (user.email) {
      try {
        persistedConversationId = await ensureServerConversation(text, baseMessages);
        await persistServerMessage(persistedConversationId, 'user', text, 'complete', userMessage.id);
        userMessagePersisted = true;
      } catch {
        console.warn('AFG_CONVERSATION_USER_MESSAGE_SAVE_FAILED');
      }
    }
    const abortController = new AbortController();
    activeChatAbortRef.current = abortController;

    const assistantId = crypto.randomUUID();
    const initialAssistantMessage: AfgMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, initialAssistantMessage]);

    let fullContent = '';
    let requestId = '';
    try {
      let streamCompleted = false;
      for (let attempt = 0; attempt < 3 && !streamCompleted; attempt++) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              // Cookie-authenticated POST requests must include the matching double-submit CSRF token.
              'X-CSRF-Token': decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || ''),
            },
            body: JSON.stringify({
              messages: [...baseMessages, userMessage].map((m) => ({ role: m.role, content: m.content })),
              model: modelToUse,
              language,
              ...toolOptions,
              thinking_level: thinkingLevel,
              plan_mode: planMode,
              permission_level: permissionLevel,
              dual_planning: dualPlanning && systemFeatures.dual_planning_enabled,
            }),
            signal: abortController.signal,
          });
          if (!response.ok) {
            if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
              const baseDelay = 500 * (2 ** attempt);
              await new Promise((resolve) => setTimeout(resolve, baseDelay + Math.floor(Math.random() * Math.max(1, baseDelay * 0.35))));
              continue;
            }
            const payload = await response.json().catch(() => ({}));
            if (typeof payload.requestId === 'string') requestId = payload.requestId;
            throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { retryable: payload.retryable === true || [429,502,503,504].includes(response.status) });
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Missing response stream');
          const decoder = new TextDecoder();
          let streamFailed = false;
          let streamRetryable = true;
          let streamErrorMessage = 'The AI returned an empty or interrupted response.';
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
                if (parsed.type === 'meta' && typeof parsed.requestId === 'string') { requestId = parsed.requestId; }
                else if (parsed.type === 'content' && typeof parsed.text === 'string') {
                  fullContent += parsed.text;
                  setMessages((previous) => previous.map((message) => message.id === assistantId ? { ...message, content: fullContent } : message));
                } else if (parsed.type === 'error') { streamFailed = true; streamRetryable = parsed.retryable !== false; streamErrorMessage = typeof parsed.error === 'string' ? parsed.error : streamErrorMessage; }
              } catch { /* Ignore malformed individual SSE events. */ }
            }
          }
          if (streamFailed || !fullContent.trim()) throw Object.assign(new Error(streamErrorMessage), { retryable: streamFailed ? streamRetryable : true });
          streamCompleted = true;
        } catch (error) {
          if (abortController.signal.aborted || fullContent.trim() || attempt >= 2 || (error instanceof Error && (error as Error & { retryable?: boolean }).retryable === false)) throw error;
          const baseDelay = 500 * (2 ** attempt);
          await new Promise((resolve) => setTimeout(resolve, baseDelay + Math.floor(Math.random() * Math.max(1, baseDelay * 0.35))));
        }
      }
      if (!streamCompleted) throw new Error('The AI response could not be completed.');
      if (typeof toolOptions.productivityType === 'string' && fullContent.trim()) {
        const csrfToken = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '';
        void fetch(API_BASE_URL + '/api/productivity/items', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrfToken) },
          body: JSON.stringify({
            type: toolOptions.productivityType,
            title: text.trim().replace(/\\s+/g, ' ').slice(0, 160) || 'Productivity result',
            content: fullContent.slice(0, 20000),
            parameters: toolOptions.productivityParameters || {},
          }),
        }).then(async (response) => {
          if (!response.ok) console.warn('AFG_PRODUCTIVITY_SAVE_UNAVAILABLE', response.status);
        }).catch(() => console.warn('AFG_PRODUCTIVITY_SAVE_UNAVAILABLE'));
      }
      if (persistedConversationId && userMessagePersisted && fullContent.trim()) {
        try { await persistServerMessage(persistedConversationId, 'assistant', fullContent, 'complete', assistantId); }
        catch { console.warn('AFG_CONVERSATION_ASSISTANT_MESSAGE_SAVE_FAILED'); }
      }
      setMessages((previous) => previous.map((message) => message.id === assistantId ? { ...message, isStreaming: false } : message));
    } catch {
      const supportReference = requestId ? (language === 'dari' ? `\nشناسه پیگیری: ${requestId}` : `\nRequest ID: ${requestId}`) : '';
      const userFacingError = (language === 'dari'
        ? 'پاسخ کامل نشد. پیام شما باقی مانده است؛ اتصال و مدل را بررسی کرده و دوباره تلاش کنید.'
        : 'The response could not be completed. Your prompt is preserved; check the connection and model, then retry.') + supportReference;

      if (abortController.signal.aborted) {
        setMessages(prev => prev.filter((message) => message.id !== assistantId));
      } else {
        const failedContent = fullContent.trim() ? `${fullContent}\n\n${userFacingError}` : userFacingError;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: failedContent, isStreaming: false, isError: true, retryable: true } : m
        ));
        if (persistedConversationId && userMessagePersisted) {
          try { await persistServerMessage(persistedConversationId, 'assistant', failedContent, 'failed', assistantId); }
          catch { console.warn('AFG_CONVERSATION_FAILED_MESSAGE_SAVE_FAILED'); }
        }
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
    serverConversationRef.current = null;
    setCurrentSessionId(`chat-${Date.now()}`);
    setMessages(context);
    void handleSendMessage(editedText.trim(), original.attachments || [], context);
  };

  const handleBranchMessage = (messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    serverConversationRef.current = null;
    setCurrentSessionId(`chat-${Date.now()}`);
    setMessages(messages.slice(0, index + 1));
  };

  const handleDeleteMessage = async (messageId: string) => {
    const conversationId = serverConversationRef.current;
    if (user.email && conversationId && /^[0-9a-f-]{36}$/i.test(messageId)) {
      try {
        await apiFetch('/api/conversations/' + encodeURIComponent(conversationId) + '/messages/' + encodeURIComponent(messageId), {
          method: 'DELETE',
          headers: getCsrfHeaders(),
        });
      } catch {
        console.warn('AFG_CONVERSATION_MESSAGE_DELETE_FAILED');
        return;
      }
    }
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
    serverConversationRef.current = null;
    setCurrentSessionId(`chat-${Date.now()}`);
    setMessages(context);
    void handleSendMessage(userMessage.content, userMessage.attachments || [], context);
  };

  const handleSelectHistoryChat = (session: AfgChatSession) => {
    serverConversationRef.current = session.id.startsWith('chat-') ? null : session.id;
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setCurrentTab('chat');
  };

  const handleNewChat = () => {
    serverConversationRef.current = null;
    setCurrentSessionId(`chat-${Date.now()}`);
    setMessages([]);
    setCurrentTab('chat');
  };

  if (isIntroVisible) {
    return <AfgCinematicIntro language={language} onComplete={() => { localStorage.setItem('afg_intro_seen', 'true'); setIsIntroVisible(false); }} />;
  }

  if (!hasSelectedLanguage) {
    return <AfgLanguageModal isOpen={true} language={null} onSelectLanguage={handleSetLanguage} />;
  }

  if (!hasEnteredApp) {
    if (!authCheckResolved) return <div className="min-h-screen grid place-items-center bg-[var(--bg-main)] text-[var(--text-secondary)]" role="status" aria-live="polite">{language === 'dari' ? 'در حال بررسی ورود…' : 'Checking your session…'}</div>;
    return <AfgAuthGate language={language} onContinueGuest={() => { localStorage.setItem('afg_entry_mode', 'guest'); setHasEnteredApp(true); }} onAuthenticated={() => { localStorage.setItem('afg_entry_mode', 'account'); setHasEnteredApp(true); window.dispatchEvent(new Event('afg-auth-change')); }} />;
  }

  return (
    <div className={`min-h-screen w-full flex flex-col transition-colors duration-200 ${(theme === 'dark' || theme === 'neon' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) ? 'bg-[#060b18] text-slate-100' : 'bg-[#f4f7fc] text-slate-900'}`}>
      
      {/* AFG AI Header */}
      <AfgHeader
        language={language}
        theme={theme}
        user={user}
        onToggleLanguage={handleToggleLanguage}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setCurrentTab('settings')}
        onOpenMenu={() => setIsCommandPaletteOpen(true)}
        onNewChat={handleNewChat}
        onOpenModels={() => setCurrentTab('offline-models')}
      />

      {profileLoadError && <div role="alert" className="mx-auto mt-2 w-[min(94%,48rem)] rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
        {profileLoadError}
        <button type="button" className="ms-3 underline font-semibold" onClick={() => { setChatLoadAttempt((value) => value + 1); window.dispatchEvent(new Event('afg-auth-change')); }}>{language === 'dari' ? 'تلاش دوباره' : 'Retry'}</button>
      </div>}
      {/* Main Content Area */}
      <main className="min-h-0 flex-1 w-full overflow-y-auto pb-4 pt-2 md:ms-0">
        <ErrorBoundary>
        <React.Suspense
          fallback={
            <div className="mx-auto flex min-h-[40vh] items-center justify-center text-sm text-slate-500" role="status" aria-live="polite">
              {language === 'dari' ? 'در حال بارگذاری...' : 'Loading...'}
            </div>
          }
        >
        {currentTab === 'home' && (
          <AfgHomeView
            language={language}
            user={user}
            onChangeTab={setCurrentTab}
            onStartChatWithPrompt={handleStartChatWithPrompt}
            capabilities={capabilitySnapshot.capabilities}
            announcements={announcements}
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
            isInitialLoading={isInitialChatLoading}
            language={language}
            user={user}
            initialPrompt={initialPromptForChat}
            availableModels={availableModels}
            modelOptions={modelOptions}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            capabilities={capabilitySnapshot.capabilities}
            thinkingLevel={thinkingLevel}
            planMode={planMode}
            permissionLevel={permissionLevel}
            systemFeatures={systemFeatures}
            findQuery={chatFindQuery}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />
        )}

        {currentTab === 'image-gen' && (
          <LazyAfgImageGenView
            language={language}
          />
        )}

        {currentTab === 'video-gen' && (
          <LazyAfgVideoGenView
            language={language}
          />
        )}

        {currentTab === 'tools' && (
          <LazyAfgToolsCenter language={language} capabilities={capabilitySnapshot.capabilities} onRunTool={(prompt, options) => { setCurrentTab('chat'); void handleSendMessage(prompt, [], messages, options); }} />
        )}

        {currentTab === 'terminal' && <LazyAfgTerminalView language={language} />}

        {currentTab === 'offline-learning' && <LazyAfgOfflineView language={language} />}

        {(currentTab === 'offline-ai-hub' || currentTab === 'offline-chat' || currentTab === 'offline-models') && (
          <LazyAfgOfflineHubView
            language={language}
            initialView={currentTab === 'offline-models' ? 'models' : 'chat'}
          />
        )}

        {currentTab === 'history' && (
          <LazyAfgHistoryView
            language={language}
            onSelectChat={handleSelectHistoryChat}
            onNewChat={handleNewChat}
            activeSessionId={currentSessionId}
            isAuthenticated={Boolean(user.email)}
          />
        )}


        {currentTab === 'settings' && (
          <LazyAfgSettingsView
            language={language}
            theme={theme}
            user={user}
            onSetLanguage={handleSetLanguage}
            onToggleTheme={handleToggleTheme}
            onSetTheme={setTheme}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        )}

        {currentTab === 'admin' && (
          <LazyAfgAdminPanel language={language} />
        )}
        </React.Suspense>
        </ErrorBoundary>
      </main>

      {currentTab !== 'terminal' && systemFeatures.terminal_exec_enabled && (
        <button
          type="button"
          onClick={() => setCurrentTab('terminal')}
          aria-label={language === 'dari' ? 'باز کردن ترمینل AFG AI' : 'Open AFG AI Terminal'}
          title={language === 'dari' ? 'ترمینل · Ctrl+Shift+T' : 'Terminal · Ctrl+Shift+T'}
          className="fixed z-40 bottom-[max(1.1rem,env(safe-area-inset-bottom))] end-4 inline-flex min-h-12 items-center gap-2 rounded-full border border-cyan-300/40 bg-[#07111f]/95 px-4 text-sm font-bold text-cyan-200 shadow-[0_8px_35px_rgba(6,182,212,.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-[#0b1b2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <TerminalIcon size={18} aria-hidden="true" />
          <span>{language === 'dari' ? 'ترمینل' : 'Terminal'}</span>
        </button>
      )}

      <AfgCommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        language={language}
        messages={messages}
        modelName={selectedModel === 'auto' ? 'Auto model' : (modelOptions.find((item) => selectedModel.endsWith(item.id))?.displayName || selectedModel)}
        contextWindow={modelOptions.find((item) => selectedModel.endsWith(item.id))?.contextWindow || 0}
        thinkingLevel={thinkingLevel}
        onThinkingLevel={setThinkingLevel}
        planMode={planMode}
        onPlanMode={setPlanMode}
        dualPlanning={dualPlanning}
        onDualPlanning={setDualPlanning}
        permissionLevel={permissionLevel}
        onPermissionLevel={setPermissionLevel}
        features={systemFeatures}
        onOpenHistory={() => setCurrentTab('history')}
        onOpenSettings={() => setCurrentTab('settings')}
        onOpenNavigation={() => setIsSideMenuOpen(true)}
        onOpenTerminal={() => setCurrentTab('terminal')}
        onClearChat={() => { activeChatAbortRef.current?.abort(); handleNewChat(); }}
        onFindInChat={(query) => setChatFindQuery(query)}
      />

      {/* Slide-over Side Menu Drawer */}
      <AfgSideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        currentTab={currentTab}
        onChangeTab={setCurrentTab}
        language={language}
        user={user}
        onNewChat={handleNewChat}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

    </div>
  );
}
