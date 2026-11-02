/**
 * Central UI state for the workspace.
 * Plain React hooks + context; no external state library.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_MODEL, INITIAL_CHAT_ID, SEED_CHATS, SEED_PROJECTS } from './data';
import { sendChatMessage } from './api';
import type { Chat, Direction, Message, Project, SidebarTab, View } from './types';
import { uid } from './utils';

const NEW_CHAT_TITLE = 'New Code chat';

interface WorkspaceState {
  /** Mobile drawer. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Desktop collapse. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  tab: SidebarTab;
  setTab: (tab: SidebarTab) => void;
  view: View;
  setView: (view: View) => void;
  search: string;
  setSearch: (value: string) => void;
  chats: Chat[];
  filteredChats: Chat[];
  projects: Project[];
  activeChat: Chat;
  selectChat: (id: string) => void;
  newChat: () => void;
  sendMessage: (text: string) => Promise<void>;
  isReplying: boolean;
  model: string;
  setModel: (id: string) => void;
  dir: Direction;
  setDir: (dir: Direction) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function createEmptyChat(): Chat {
  return { id: uid('chat'), title: NEW_CHAT_TITLE, subtitle: 'App workspace', updatedAt: Date.now(), messages: [] };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<SidebarTab>('chats');
  const [view, setView] = useState<View>('chat');
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState<Chat[]>(SEED_CHATS);
  const [activeChatId, setActiveChatId] = useState<string>(INITIAL_CHAT_ID);
  const [isReplying, setIsReplying] = useState(false);
  // MODEL INJECTION POINT: persist the selected model.
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [projects] = useState<Project[]>(SEED_PROJECTS);
  const [dir, setDirState] = useState<Direction>(() => (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'));

  const activeChat = chats.find((c) => c.id === activeChatId) ?? chats[0];

  const setDir = useCallback((next: Direction) => {
    document.documentElement.dir = next;
    document.documentElement.lang = next === 'rtl' ? 'fa' : 'en';
    setDirState(next);
  }, []);

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [chats, search]);

  const selectChat = useCallback((id: string) => {
    setActiveChatId(id);
    setView('chat');
    setSidebarOpen(false);
  }, []);

  const newChat = useCallback(() => {
    // Reuse the current chat if it is still empty, so empty chats don't pile up.
    if (activeChat && activeChat.messages.length === 0) {
      setView('chat');
      setSidebarOpen(false);
      return;
    }
    const chat = createEmptyChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setView('chat');
    setSidebarOpen(false);
  }, [activeChat]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || isReplying || !activeChat) return;

      const chatId = activeChat.id;
      const userMessage: Message = { id: uid('msg'), role: 'user', content };
      const history = [...activeChat.messages, userMessage];

      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                title: c.title === NEW_CHAT_TITLE ? content.slice(0, 40) : c.title,
                updatedAt: Date.now(),
                messages: history,
              }
            : c,
        ),
      );

      setIsReplying(true);
      try {
        // API INJECTION POINT: swap sendChatMessage for a real (ideally streaming) call.
        const reply = await sendChatMessage(history, model);
        const assistantMessage: Message = { id: uid('msg'), role: 'assistant', content: reply };
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, assistantMessage] } : c,
          ),
        );
      } catch {
        const errorMessage: Message = {
          id: uid('msg'),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        };
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, errorMessage] } : c)),
        );
      } finally {
        setIsReplying(false);
      }
    },
    [activeChat, isReplying, model],
  );

  const value: WorkspaceState = {
    sidebarOpen,
    setSidebarOpen,
    collapsed,
    toggleCollapsed,
    tab,
    setTab,
    view,
    setView,
    search,
    setSearch,
    chats,
    filteredChats,
    projects,
    activeChat,
    selectChat,
    newChat,
    sendMessage,
    isReplying,
    model,
    setModel,
    dir,
    setDir,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
