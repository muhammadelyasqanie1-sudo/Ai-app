import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  RefreshCw, 
  Share2, 
  Paperclip, 
  ChevronDown, 
  ChevronUp,
  BrainCircuit,
  MessageSquare,
  Bot,
  Square
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import { AfgChatInputCapsule } from './AfgChatInputCapsule';
import { MarkdownRenderer } from '../MarkdownRenderer';
import type { Language, AfgMessage, ChatAttachment, UserProfile, AfgCapabilityKey, AfgModelOption } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgChatViewProps {
  messages: AfgMessage[];
  onSendMessage: (text: string, attachments: ChatAttachment[]) => void;
  onStop: () => void;
  onRetryMessage: (messageId: string) => void;
  isLoading: boolean;
  language: Language;
  user: UserProfile;
  initialPrompt?: string;
  availableModels: string[];
  modelOptions: AfgModelOption[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  capabilities: Record<AfgCapabilityKey, boolean>;
}

export const AfgChatView: React.FC<AfgChatViewProps> = ({
  messages,
  onSendMessage,
  onStop,
  onRetryMessage,
  isLoading,
  language,
  user,
  initialPrompt,
  availableModels,
  modelOptions,
  selectedModel,
  onSelectModel,
  capabilities,
}) => {
  const t = translations[language];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Speech synthesis state (Read Aloud)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (initialPrompt) {
      onSendMessage(initialPrompt, []);
    }
  }, []);

  // Web Speech API Read Aloud
  const handleReadAloud = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) {
      alert(language === 'dari' ? 'مرورگر شما از تبدیل متن به گفتار پشتیبانی نمی‌کند.' : 'Web Speech is not supported in this browser.');
      return;
    }

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown symbols for cleaner voice speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/[*#_`>]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Choose appropriate voice
    const voices = window.speechSynthesis.getVoices();
    if (language === 'dari') {
      const persianVoice = voices.find(v => v.lang.startsWith('fa') || v.lang.startsWith('ar'));
      if (persianVoice) utterance.voice = persianVoice;
    } else {
      const enVoice = voices.find(v => v.lang.startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    }

    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const promptSuggestions = [
    t.suggestPrompt1,
    t.suggestPrompt2,
    t.suggestPrompt3,
    t.suggestPrompt4,
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] max-w-5xl mx-auto w-full px-2 sm:px-4">
      
      {/* Top Session Status Bar */}
      <div className="flex items-center justify-between py-2 px-3 border-b border-cyan-900/30 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              <span>{t.chatTitle}</span>
              <span className={`w-2 h-2 rounded-full ${capabilities.chat ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" : "bg-amber-300"}`} aria-label={capabilities.chat ? (language === "dari" ? "مدل تأییدشده فعال" : "Verified chat model available") : (language === "dari" ? "مدل تأییدشده موجود نیست" : "No verified chat model")} />
            </h2>
            <p className="text-[10px] text-cyan-400/80">
              {t.chatSubtitle}
            </p>
          </div>
        </div>
        {isLoading && <button onClick={onStop} className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300"><Square className="w-3 h-3" />{language === 'dari' ? 'توقف' : 'Stop'}</button>}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-1 sm:px-3 py-4 space-y-5">
        
        {/* If no messages yet, show welcome prompt cards (Matching Screenshot 2 & 4) */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-lg mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="relative">
              <AfgBrainLogo size="xl" showBadge />
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">
                {t.brandName}
              </h2>
              <p className="text-sm text-cyan-300 font-medium mt-1">
                {t.brandTagline} • {t.brandMotto}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
              {promptSuggestions.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt, [])}
                  className="p-3 rounded-2xl bg-slate-900/70 hover:bg-cyan-950/40 border border-cyan-900/50 hover:border-cyan-500/50 text-xs text-slate-300 hover:text-cyan-200 transition-all text-right group shadow-md"
                >
                  <span className="font-semibold block mb-0.5 group-hover:text-cyan-300">
                    💡 پیشنهاد {idx + 1}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-slate-400">
                    {prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Items */}
        {messages.filter((message) => !(message.role === 'assistant' && !message.content.trim() && message.isStreaming)).map((msg) => {
          const isUser = msg.role === 'user';
          const isSpeaking = speakingMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                isUser ? 'flex-row-reverse' : 'flex-row'
              } animate-in fade-in duration-200`}
            >
              {/* Avatar */}
              <div className="shrink-0 mt-0.5">
                {isUser ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-9 h-9 rounded-xl object-cover ring-2 ring-cyan-500/50"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-sky-600 flex items-center justify-center p-1.5 shadow-[0_0_12px_rgba(0,229,255,0.4)]">
                    <AfgBrainLogo size="sm" showBadge={false} />
                  </div>
                )}
              </div>

              {/* Message Bubble Content */}
              <div
                className={`flex flex-col max-w-[85%] sm:max-w-[78%] ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                {/* User/Model Name & Timestamp */}
                <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">
                    {isUser ? (language === 'dari' ? user.name : user.nameEn) : 'AFG AI'}
                  </span>
                  <span>•</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Simulated Reasoning Thoughts Dropdown if exists */}
                {msg.thought && (
                  <div className="mb-2 w-full">
                    <button
                      onClick={() => toggleThought(msg.id)}
                      className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-950/30 border border-cyan-800/40 px-2.5 py-1 rounded-lg hover:bg-cyan-900/30 transition-colors"
                    >
                      <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{language === 'dari' ? 'فرایند تفکر هوش مصنوعی' : 'Reasoning Process'}</span>
                      {expandedThoughts[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {expandedThoughts[msg.id] && (
                      <div className="mt-1 p-2.5 rounded-xl bg-slate-900/80 border border-cyan-900/40 text-xs text-slate-300 font-mono italic leading-relaxed">
                        {msg.thought}
                      </div>
                    )}
                  </div>
                )}

                {/* Main Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm sm:text-base leading-relaxed shadow-lg ${
                    isUser
                      ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white rounded-tr-none'
                      : 'bg-[#0b142c] text-slate-100 border border-cyan-900/40 rounded-tl-none shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                  }`}
                >
                  {/* Attachments preview inside message */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-white/10">
                      {msg.attachments.map((att, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/20 text-xs"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span className="truncate max-w-[140px]">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Text Content */}
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}

                  {msg.isStreaming && (
                    <span className="streaming-cursor ml-1" />
                  )}
                </div>

                {/* Message Actions Bar (Read Aloud, Copy) */}
                {!isUser && !msg.isStreaming && (
                  <div className="flex items-center gap-2 mt-1.5 px-1 text-slate-400">
                    {msg.retryable && <button onClick={() => onRetryMessage(msg.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/10"><RefreshCw className="w-3.5 h-3.5" />{language === 'dari' ? 'تلاش دوباره' : 'Retry'}</button>}
                    {/* Read Aloud Button (User Request #7) */}
                    <button
                      onClick={() => handleReadAloud(msg.id, msg.content)}
                      className={`flex items-center gap-1 text-[11px] p-1 px-2 rounded-md hover:bg-slate-800 transition-colors ${
                        isSpeaking ? 'text-cyan-400 bg-cyan-950/40' : 'hover:text-slate-200'
                      }`}
                      title={isSpeaking ? t.stopSpeech : t.readAloud}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                          <span className="text-cyan-400">{t.stopSpeech}</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>{t.readAloud}</span>
                        </>
                      )}
                    </button>

                    {/* Copy Button */}
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="flex items-center gap-1 text-[11px] p-1 px-2 rounded-md hover:bg-slate-800 hover:text-slate-200 transition-colors"
                      title={t.copy}
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{t.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.copy}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-sky-600 flex items-center justify-center p-1.5 shadow-[0_0_12px_rgba(0,229,255,0.4)]">
              <AfgBrainLogo size="sm" showBadge={false} />
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0b142c] border border-cyan-900/40 text-cyan-300 flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{language === 'dari' ? 'AFG AI در حال پردازش و پاسخگویی...' : 'AFG AI is generating a thoughtful response...'}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Signature AFG AI Bottom Input Capsule */}
      <div className="py-2">
        <AfgChatInputCapsule
          onSendMessage={onSendMessage}
          disabled={isLoading || availableModels.length === 0}
          language={language}
          availableModels={availableModels}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          modelsLoading={isLoading}
        />
      </div>

    </div>
  );
};
