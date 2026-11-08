import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { AFG_EASE_OUT, AFG_MOTION, AFG_MOTION_VARIANTS } from '../../animations/variants';
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
  Square,
  Pencil,
  GitBranch,
  Trash2,
  Code2,
  FolderSearch,
  Globe,
  FilePlus2
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import { AfgChatInputCapsule } from './AfgChatInputCapsule';
import { MarkdownRenderer } from '../MarkdownRenderer';
import type { Language, AfgMessage, ChatAttachment, UserProfile, AfgCapabilityKey, AfgModelOption } from '../../types/afg';
import type { AfgSystemFeatures } from './AfgCommandPalette';
import { translations } from '../../utils/afgTranslations';
import { getIntlLocale } from '../../utils/i18n';

interface AfgChatViewProps {
  messages: AfgMessage[];
  agentActivities?: Array<{id:string;name:string;label:string;detail?:string;url?:string;sources?:Array<{title:string;url:string;snippet?:string;publishedDate?:string}>;status:'running'|'completed'|'failed';timestamp:number}>;
  onSendMessage: (text: string, attachments: ChatAttachment[]) => void;
  onStop: () => void;
  onRetryMessage: (messageId: string) => void;
  onEditMessage: (messageId: string, editedText: string) => void;
  onBranchMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  isLoading: boolean;
  onRecordingChange?: (active: boolean) => void;
  isInitialLoading?: boolean;
  language: Language;
  user: UserProfile;
  initialPrompt?: string;
  availableModels: string[];
  modelOptions: AfgModelOption[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  capabilities: Record<AfgCapabilityKey, boolean>;
  thinkingLevel: 'minimal' | 'standard' | 'deep';
  planMode: boolean;
  permissionLevel: 'ask' | 'guided' | 'full';
  systemFeatures: AfgSystemFeatures;
  findQuery: string;
  onOpenCommandPalette: () => void;
  onOpenAfgAssistant: () => void;
}

export const AfgChatView: React.FC<AfgChatViewProps> = ({
  messages,
  agentActivities = [],
  onSendMessage,
  onStop,
  onRetryMessage,
  onEditMessage,
  onBranchMessage,
  onDeleteMessage,
  isLoading,
  onRecordingChange,
  isInitialLoading = false,
  language,
  user,
  initialPrompt,
  availableModels,
  modelOptions,
  selectedModel,
  onSelectModel,
  capabilities,
  thinkingLevel,
  planMode,
  permissionLevel,
  systemFeatures,
  findQuery,
  onOpenCommandPalette,
  onOpenAfgAssistant,
}) => {
  const t = translations[language];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSlowResponse, setIsSlowResponse] = useState(false);
  useEffect(() => {
    if (!isLoading) { setIsSlowResponse(false); return; }
    const timer = window.setTimeout(() => setIsSlowResponse(true), 10000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);
  
  // Speech synthesis state (Read Aloud)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [voiceEnabled,setVoiceEnabled]=useState(()=>localStorage.getItem('afg_voice_enabled')!=='false');
  const ttsAvailable=voiceEnabled&&capabilities['text-to-speech'];
  useEffect(()=>{const sync=()=>setVoiceEnabled(localStorage.getItem('afg_voice_enabled')!=='false');window.addEventListener('afg-voice-preference-change',sync);window.addEventListener('afg-preferences-change',sync);return()=>{window.removeEventListener('afg-voice-preference-change',sync);window.removeEventListener('afg-preferences-change',sync);};},[]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(()=>{if(!voiceEnabled){audioRef.current?.pause();audioRef.current=null;setSpeakingMsgId(null);}},[voiceEnabled]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    if (!findQuery.trim()) return;
    const needle = findQuery.toLocaleLowerCase();
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-afg-message]')).find((node) => (node.innerText || '').toLocaleLowerCase().includes(needle));
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('afg-chat-search-hit');
    const timer = window.setTimeout(() => target?.classList.remove('afg-chat-search-hit'), 1800);
    return () => window.clearTimeout(timer);
  }, [findQuery, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (initialPrompt) {
      onSendMessage(initialPrompt, []);
    }
  }, []);

  // Provider-backed Read Aloud; unavailable unless a verified TTS adapter exists.
  const handleReadAloud = async (msgId: string, text: string) => {
    if (!ttsAvailable) return;
    if (speakingMsgId === msgId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingMsgId(null);
      return;
    }
    audioRef.current?.pause();
    setSpeakingMsgId(msgId);
    const cleanText = text.replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, 'Code block omitted.').replace(/[*#_\x60>]/g, '').trim();
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/voice/synthesize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText.slice(0, 5000), language: language === 'dari' ? 'fa' : 'en' }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.audioBase64 !== 'string' || typeof data.mimeType !== 'string') {
        throw new Error(data.error || 'Speech synthesis is unavailable.');
      }
      const audio = new Audio('data:' + data.mimeType + ';base64,' + data.audioBase64);
      audioRef.current = audio;
      audio.onended = () => { audioRef.current = null; setSpeakingMsgId(null); };
      audio.onerror = () => { audioRef.current = null; setSpeakingMsgId(null); };
      await audio.play();
    } catch (error) {
      audioRef.current = null;
      setSpeakingMsgId(null);
      alert(error instanceof Error ? error.message : (language === 'dari' ? 'تولید صدا ناموفق بود.' : 'Speech synthesis failed.'));
    }
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
    <div style={{ maxWidth: "var(--afg-chat-width, 64rem)" }} className="afg-chat-view flex h-[calc(100dvh-5.25rem)] min-h-0 flex-col mx-auto w-full px-2 sm:px-4" dir={["dari","pashto","persian","arabic","urdu"].includes(language) ? "rtl" : "ltr"}>
      
      {/* Top Session Status Bar */}
      <div className="afg-chat-statusbar sticky top-0 z-20 flex items-center justify-between py-2 px-3 border-b border-cyan-900/30 mb-2 bg-inherit/90 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              <span>{t.chatTitle}</span>
              <span className={`w-2 h-2 rounded-full ${capabilities.chat ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" : "bg-amber-300"}`} role="img" aria-label={capabilities.chat ? (language === "dari" ? "مدل تأییدشده فعال" : "Verified chat model available") : (language === "dari" ? "مدل تأییدشده موجود نیست" : "No verified chat model")} />
            </h1>
            <p className="text-[10px] text-cyan-400/80">
              {t.chatSubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">{(planMode || thinkingLevel !== 'standard') && <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[9px] font-semibold text-cyan-200 animate-pulse">{planMode ? (language === 'dari' ? 'برنامه‌ریزی' : 'Plan mode') : '🧠 ' + thinkingLevel}</span>}<button type="button" onClick={onOpenAfgAssistant} className="rounded-lg border border-violet-400/35 bg-gradient-to-r from-cyan-500/15 via-violet-500/15 to-fuchsia-500/15 px-2.5 py-2 text-[10px] font-bold text-cyan-100 shadow-[0_0_18px_rgba(124,77,255,.12)] hover:border-cyan-300/60">✦ AFG AI</button><button type="button" onClick={onOpenCommandPalette} className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-2 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20">{language === 'dari' ? 'منوی سریع' : 'Quick menu'} <span className="opacity-60">⌘K</span></button></div>
        {isLoading && <button onClick={onStop} className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300"><Square className="w-3 h-3" />{language === 'dari' ? 'توقف' : 'Stop'}</button>}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-1 sm:px-3 py-4 space-y-5">
        {agentActivities.length > 0 && (
          <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg dark:border-cyan-800/40 dark:bg-slate-950/70" aria-live="polite" aria-label={language === 'dari' ? 'فعالیت زنده هوش مصنوعی' : 'Live AI activity'}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-700 dark:text-cyan-200"><Globe className="h-4 w-4" />{language === 'dari' ? 'فعالیت زنده هوش مصنوعی' : 'Live AI activity'}</div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{agentActivities.some(item => item.status === 'running') ? (language === 'dari' ? 'در حال اجرا' : 'Working') : (language === 'dari' ? 'گزارش فعالیت' : 'Activity log')}</span>
            </div>
            <ol className="space-y-2">
              {agentActivities.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.status === 'completed' ? 'bg-emerald-400' : item.status === 'failed' ? 'bg-rose-400' : 'bg-cyan-300 animate-pulse'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
                      <span className="text-[10px] text-slate-500">{item.status === 'completed' ? (language === 'dari' ? 'انجام شد' : 'Completed') : item.status === 'failed' ? (language === 'dari' ? 'ناموفق' : 'Failed') : (language === 'dari' ? 'در حال انجام' : 'In progress')}</span>
                    </div>
                    {item.detail && <div className="mt-0.5 break-all text-[11px] text-slate-600 dark:text-slate-400">{item.detail}</div>}
                    {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block break-all text-[11px] text-cyan-700 underline dark:text-cyan-400 underline-offset-2">{item.url}</a>}
                    {item.sources && item.sources.length > 0 && <div className="mt-2 grid gap-2">{item.sources.map((source,index) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:border-cyan-400 dark:border-slate-700 dark:bg-slate-900/70"><span className="block text-[11px] font-semibold text-cyan-800 dark:text-cyan-300">{index + 1}. {source.title}</span>{source.snippet && <span className="mt-1 block text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">{source.snippet}</span>}{source.publishedDate && <span className="mt-1 block text-[10px] text-slate-500">{source.publishedDate}</span>}</a>)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        
        {isInitialLoading && <div className="mx-auto w-full max-w-2xl space-y-5 py-8" aria-label={language === 'dari' ? 'در حال بارگذاری گفتگو' : 'Loading conversation'} role="status"><div className="h-7 w-2/3 rounded-lg afg-skeleton-line"/><div className="h-24 w-full rounded-2xl afg-skeleton-line"/><div className="ms-auto h-20 w-4/5 rounded-2xl afg-skeleton-line"/><div className="h-28 w-full rounded-2xl afg-skeleton-line"/></div>}
        {/* If no messages yet, show welcome prompt cards. */}
        {!isInitialLoading && messages.length === 0 && (
          <div className="afg-chat-welcome flex flex-col items-center justify-center min-h-[60vh] text-center max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="relative">
              <AfgBrainLogo size="xl" showBadge />
            </div>

            <div>
              <h2 className="afg-chat-welcome-title text-2xl font-black text-white">{language === 'dari' ? 'امروز چه چیزی می‌خواهید بسازید؟' : 'What do you want to build?'}</h2>
              <p className="text-sm text-cyan-300 font-medium mt-2">{language === 'dari' ? 'با یک ایده شروع کنید یا پروژه تازه‌ای بسازید.' : 'Start with an idea or create a new project.'}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-start" dir={['dari','pashto','persian','arabic','urdu'].includes(language) ? 'rtl' : 'ltr'}>
              {promptSuggestions.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt, [])}
                  className="afg-prompt-card p-3 rounded-2xl bg-slate-900/70 hover:bg-cyan-950/40 border border-cyan-900/50 hover:border-cyan-500/50 text-xs text-start text-slate-300 hover:text-cyan-200 transition-all group shadow-md" dir={['dari','pashto','persian','arabic','urdu'].includes(language) ? 'rtl' : 'ltr'}
                >
                  <span className="flex items-center gap-2 font-semibold mb-1 group-hover:text-cyan-300">
                    {idx === 0 ? <Code2 className="h-4 w-4 text-cyan-400"/> : idx === 1 ? <FolderSearch className="h-4 w-4 text-cyan-400"/> : idx === 2 ? <Globe className="h-4 w-4 text-cyan-400"/> : <FilePlus2 className="h-4 w-4 text-cyan-400"/>}
                    <span>{language === 'dari' ? 'پیشنهاد' : 'Try this'}</span><ChevronDown className="ms-auto h-3 w-3 -rotate-90 opacity-50"/>
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
            <motion.div
              key={msg.id}
              variants={AFG_MOTION_VARIANTS.messageIn}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: AFG_MOTION.normal, ease: AFG_EASE_OUT }}
              className={`flex items-start gap-3 ${
                isUser ? 'flex-row-reverse' : 'flex-row'
              }`}
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
                    {new Intl.DateTimeFormat(getIntlLocale(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(msg.timestamp))}
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
                  data-afg-message="true"
                  className={`rounded-2xl px-4 py-3 text-sm sm:text-base leading-relaxed shadow-lg ${
                    isUser
                      ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white rounded-tr-none'
                       : 'afg-assistant-bubble border rounded-tl-none shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
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

                {isUser && !isLoading && (
                  <div className="mt-2 w-full space-y-2">
                    {editingMessageId === msg.id ? (
                      <div className="space-y-2">
                        <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} rows={3} className="w-full rounded-xl border border-cyan-700 bg-slate-950 p-3 text-sm text-white" />
                        <div className="flex gap-2">
                          <button onClick={() => { onEditMessage(msg.id, editDraft); setEditingMessageId(null); }} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950">{language === 'dari' ? 'ویرایش و ارسال' : 'Edit & resend'}</button>
                          <button onClick={() => setEditingMessageId(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">{language === 'dari' ? 'لغو' : 'Cancel'}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500">
                        <button onClick={() => { setEditingMessageId(msg.id); setEditDraft(msg.content); }} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="h-3 w-3" />{language === 'dari' ? 'ویرایش' : 'Edit'}</button>
                        <button onClick={() => onBranchMessage(msg.id)} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-800 hover:text-cyan-300"><GitBranch className="h-3 w-3" />{language === 'dari' ? 'شاخه جدید' : 'Branch'}</button>
                        <button onClick={() => onDeleteMessage(msg.id)} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3 w-3" />{language === 'dari' ? 'حذف' : 'Delete'}</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Message Actions Bar (Read Aloud, Copy) */}
                {!isUser && !msg.isStreaming && (
                  <div className="flex items-center gap-2 mt-1.5 px-1 text-slate-400">
                    <button onClick={() => onRetryMessage(msg.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/10"><RefreshCw className="w-3.5 h-3.5" />{msg.retryable ? (language === 'dari' ? 'تلاش دوباره' : 'Retry') : (language === 'dari' ? 'تولید دوباره' : 'Regenerate')}</button>
                    <button onClick={() => onBranchMessage(msg.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800"><GitBranch className="w-3.5 h-3.5" />{language === 'dari' ? 'شاخه' : 'Branch'}</button>
                    <button onClick={() => onDeleteMessage(msg.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" />{language === 'dari' ? 'حذف' : 'Delete'}</button>
                    {/* Read Aloud Button (User Request #7) */}
                    <button
                      disabled={!ttsAvailable}
                      onClick={() => handleReadAloud(msg.id, msg.content)}
                      className={`flex items-center gap-1 text-[11px] p-1 px-2 rounded-md hover:bg-slate-800 transition-colors ${
                        isSpeaking ? 'text-cyan-400 bg-cyan-950/40' : ttsAvailable ? 'hover:text-slate-200' : 'opacity-30 cursor-not-allowed'
                      }`}
                      title={!ttsAvailable ? (language === 'dari' ? 'ارائه‌دهنده متن به گفتار تأیید نشده است' : 'No verified text-to-speech provider is available') : (isSpeaking ? t.stopSpeech : t.readAloud)}
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
            </motion.div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-sky-600 flex items-center justify-center p-1.5 shadow-[0_0_12px_rgba(0,229,255,0.4)]">
              <AfgBrainLogo size="sm" showBadge={false} />
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0b142c] border border-cyan-900/40 text-cyan-300 flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{language === 'dari' ? (isSlowResponse ? 'هنوز در حال فکر کردن…' : 'AFG AI در حال پردازش و پاسخگویی...') : (isSlowResponse ? 'Still thinking…' : 'AFG AI is generating a thoughtful response...')}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Signature AFG AI Bottom Input Capsule */}
      <div className="py-2">
        <AfgChatInputCapsule
          onSendMessage={onSendMessage}
          disabled={isInitialLoading}
          language={language}
          availableModels={availableModels}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          modelsLoading={isLoading}
          speechToTextAvailable={capabilities['speech-to-text'] && systemFeatures.voice_stt_enabled}
          fileUploadEnabled={systemFeatures.file_upload_enabled}
          isLoading={isLoading}
          onRecordingChange={onRecordingChange}
          onStop={onStop}
          thinkingLevel={thinkingLevel}
          planMode={planMode}
          permissionLevel={permissionLevel}
        />
      </div>

    </div>
  );
};
