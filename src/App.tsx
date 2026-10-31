/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header, type ModelType } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EmptyState } from './components/EmptyState';
import { ChatMessageItem } from './components/ChatMessageItem';
import { ChatInput } from './components/ChatInput';
import { SettingsModal } from './components/SettingsModal';
import { ShareModal } from './components/ShareModal';
import { ExploreGptsModal } from './components/ExploreGptsModal';
import { SearchModal } from './components/SearchModal';
import {
  generateTitleFromPrompt,
  type Conversation,
  type Message,
} from './utils/chatLogic';

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'seed-1',
    title: 'Explain quantum computing simply',
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Explain quantum computing in simple terms with an analogy anyone can understand.',
        timestamp: Date.now() - 1000 * 60 * 60 * 2,
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: `### Quantum Computing in Simple Terms

Imagine a standard computer works like a normal light switch: it can be either **OFF (0)** or **ON (1)**.

A **Quantum Computer**, on the other hand, uses quantum bits or **qubits**. Thanks to two fascinating principles of quantum physics:

1. **Superposition**:
   Instead of just being 0 or 1, a qubit can exist in a state that is a mix of both at the same time—like a spinning coin before it lands.

2. **Entanglement**:
   Qubits can be linked so closely that the state of one instantly informs the state of another, no matter the distance.

### Why Does This Matter?
While normal computers check possibilities one by one (like walking through a maze sequentially), a quantum computer can evaluate millions of potential solutions simultaneously. This unlocks breakthrough speeds for:
- Discovering new life-saving medicines
- Designing ultra-efficient batteries & solar materials
- Optimizing global logistics and cryptography

Think of it not as a faster laptop, but as an entirely different kind of computational engine designed for nature's most complex challenges.`,
        timestamp: Date.now() - 1000 * 60 * 60 * 2,
      },
    ],
  },
  {
    id: 'seed-2',
    title: 'TypeScript TaskManager Class',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: 'Write a TypeScript class for managing tasks with add, toggle, and filter methods.',
        timestamp: Date.now() - 1000 * 60 * 60 * 26,
      },
      {
        id: 'msg-4',
        role: 'assistant',
        content: `Here is a clean, modern implementation for your request:

\`\`\`typescript
interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

export class TaskManager {
  private tasks: Map<string, TaskItem> = new Map();

  addTask(title: string): TaskItem {
    const task: TaskItem = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      createdAt: new Date(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  toggleTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.completed = !task.completed;
    return task.completed;
  }

  listActive(): TaskItem[] {
    return Array.from(this.tasks.values()).filter(t => !t.completed);
  }
}
\`\`\`

### Key Highlights:
1. **Type Safety**: Strictly typed with TypeScript interface.
2. **Performance**: O(1) lookups and updates via standard \`Map\`.
3. **Immutability & Extensibility**: Easy to plug into reactive UI frameworks or backend controllers.`,
        timestamp: Date.now() - 1000 * 60 * 60 * 26,
      },
    ],
  },
];

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem('chatgpt_conversations');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return SEED_CONVERSATIONS;
  });

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [temporaryMessages, setTemporaryMessages] = useState<Message[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return false;
    }
    return true;
  });
  const [selectedModel, setSelectedModel] = useState<ModelType>('gpt-4o');
  const [isTemporaryChat, setIsTemporaryChat] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [theme, setTheme] = useState<'system' | 'dark' | 'light'>(() => {
    const saved = localStorage.getItem('chatgpt_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'dark'; // ChatGPT dark mode by default
  });

  const [customInstructions, setCustomInstructions] = useState<string>(() => {
    return localStorage.getItem('chatgpt_custom_instructions') || '';
  });

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isExploreGptsOpen, setIsExploreGptsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [shareTargetConversation, setShareTargetConversation] = useState<Conversation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync theme to document class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
      else root.classList.remove('dark');
    }
    localStorage.setItem('chatgpt_theme', theme);
  }, [theme]);

  // Persist conversations
  useEffect(() => {
    try {
      localStorage.setItem('chatgpt_conversations', JSON.stringify(conversations));
    } catch {
      // fallback
    }
  }, [conversations]);

  // Handle mobile screen size
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault();
        handleNewChat();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        setIsShareOpen(false);
        setIsExploreGptsOpen(false);
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeConversation = isTemporaryChat
    ? null
    : conversations.find((c) => c.id === activeConversationId);

  const currentMessages = isTemporaryChat
    ? temporaryMessages
    : activeConversation?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages.length, isStreaming]);

  const handleNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveConversationId(null);
    setTemporaryMessages([]);
    setIsStreaming(false);
  };

  const handleSelectConversation = (id: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsTemporaryChat(false);
    setActiveConversationId(id);
    setIsStreaming(false);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  };

  const handleClearAllChats = () => {
    setConversations([]);
    setActiveConversationId(null);
    localStorage.removeItem('chatgpt_conversations');
  };

  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(conversations, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chatgpt-export-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const streamAssistantResponse = async (
    allMessages: Message[],
    targetConvId: string | null,
    reasoning: boolean
  ) => {
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    const assistantMsgId = `msg-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      reasoning: reasoning || selectedModel === 'o1-reasoning' ? '' : undefined,
    };

    if (isTemporaryChat) {
      setTemporaryMessages((prev) => [...prev, initialAssistantMsg]);
    } else if (targetConvId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? { ...c, messages: [...c.messages, initialAssistantMsg], updatedAt: Date.now() }
            : c
        )
      );
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel,
          reasoning: reasoning || selectedModel === 'o1-reasoning',
          customInstructions,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder();
      let fullContent = '';
      let fullThought = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'thought') {
                fullThought += parsed.text;
              } else if (parsed.type === 'content') {
                fullContent += parsed.text;
              }

              // Update in-place
              if (isTemporaryChat) {
                setTemporaryMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: fullContent,
                          reasoning: fullThought || m.reasoning,
                        }
                      : m
                  )
                );
              } else if (targetConvId) {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === targetConvId
                      ? {
                          ...c,
                          messages: c.messages.map((m) =>
                            m.id === assistantMsgId
                              ? {
                                  ...m,
                                  content: fullContent,
                                  reasoning: fullThought || m.reasoning,
                                }
                              : m
                          ),
                          updatedAt: Date.now(),
                        }
                      : c
                  )
                );
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      // Mark streaming completed
      if (isTemporaryChat) {
        setTemporaryMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
        );
      } else if (targetConvId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetConvId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, isStreaming: false } : m
                  ),
                }
              : c
          )
        );
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const fallbackText = "I'm here to help. What would you like to explore next?";
        if (isTemporaryChat) {
          setTemporaryMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content || fallbackText, isStreaming: false }
                : m
            )
          );
        } else if (targetConvId) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === targetConvId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: m.content || fallbackText, isStreaming: false }
                        : m
                    ),
                  }
                : c
            )
          );
        }
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = (
    text: string,
    options: { webSearch: boolean; reasoning: boolean; attachments: any[] }
  ) => {
    let finalPrompt = text;
    if (options.attachments.length > 0) {
      const attNames = options.attachments.map((a) => a.name).join(', ');
      finalPrompt = `${text ? text + '\n\n' : ''}[Attached: ${attNames}]`;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: finalPrompt,
      timestamp: Date.now(),
    };

    if (isTemporaryChat) {
      const updated = [...temporaryMessages, userMessage];
      setTemporaryMessages(updated);
      streamAssistantResponse(updated, null, options.reasoning);
      return;
    }

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      // Create new conversation
      targetConvId = `conv-${Date.now()}`;
      const newTitle = generateTitleFromPrompt(text || options.attachments[0]?.name || 'New chat');
      const newConv: Conversation = {
        id: targetConvId,
        title: newTitle,
        messages: [userMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(targetConvId);
      streamAssistantResponse([userMessage], targetConvId, options.reasoning);
    } else {
      const currentConv = conversations.find((c) => c.id === targetConvId);
      const updatedMessages = [...(currentConv?.messages || []), userMessage];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? { ...c, messages: updatedMessages, updatedAt: Date.now() }
            : c
        )
      );
      streamAssistantResponse(updatedMessages, targetConvId, options.reasoning);
    }
  };

  const handleRegenerate = () => {
    if (currentMessages.length < 2 || isStreaming) return;
    const allExceptLast = currentMessages.slice(0, -1);

    if (isTemporaryChat) {
      setTemporaryMessages(allExceptLast);
      streamAssistantResponse(allExceptLast, null, selectedModel === 'o1-reasoning');
    } else if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages: allExceptLast, updatedAt: Date.now() }
            : c
        )
      );
      streamAssistantResponse(allExceptLast, activeConversationId, selectedModel === 'o1-reasoning');
    }
  };

  const handleEditUserMessage = (newText: string) => {
    if (isStreaming) return;
    handleSendMessage(newText, { webSearch: false, reasoning: false, attachments: [] });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#212121] text-neutral-900 dark:text-neutral-100 font-sans transition-colors">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenSearchModal={() => setIsSearchOpen(true)}
        onOpenExploreGpts={() => setIsExploreGptsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShareModal={(conv) => {
          setShareTargetConversation(conv);
          setIsShareOpen(true);
        }}
      />

      {/* Main chat container */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          isTemporaryChat={isTemporaryChat}
          onToggleTemporaryChat={() => {
            setIsTemporaryChat((prev) => !prev);
            setTemporaryMessages([]);
          }}
          onNewChat={handleNewChat}
          onOpenShareModal={() => {
            setShareTargetConversation(activeConversation || null);
            setIsShareOpen(true);
          }}
          onOpenSettingsModal={() => setIsSettingsOpen(true)}
          hasActiveMessages={currentMessages.length > 0}
        />

        {/* Chat message display area */}
        <main className="flex-1 overflow-y-auto flex flex-col relative" id="chat-messages-container">
          {currentMessages.length === 0 ? (
            <EmptyState
              onSelectPrompt={(prompt) =>
                handleSendMessage(prompt, { webSearch: false, reasoning: false, attachments: [] })
              }
            />
          ) : (
            <div className="flex-1 py-4">
              {currentMessages.map((msg, index) => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isLastAssistant={index === currentMessages.length - 1 && msg.role === 'assistant'}
                  onRegenerate={handleRegenerate}
                  onEditUserMessage={handleEditUserMessage}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input box */}
        <ChatInput
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          isStreaming={isStreaming}
        />
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        customInstructions={customInstructions}
        onSaveCustomInstructions={(inst) => {
          setCustomInstructions(inst);
          localStorage.setItem('chatgpt_custom_instructions', inst);
        }}
        onClearAllChats={handleClearAllChats}
        onExportData={handleExportData}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        conversation={shareTargetConversation}
      />

      <ExploreGptsModal
        isOpen={isExploreGptsOpen}
        onClose={() => setIsExploreGptsOpen(false)}
        onSelectGpt={(name, prompt) => {
          handleNewChat();
          handleSendMessage(prompt, { webSearch: false, reasoning: false, attachments: [] });
        }}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
      />
    </div>
  );
}
