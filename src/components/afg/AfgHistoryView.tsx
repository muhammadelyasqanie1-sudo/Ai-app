import React, { useEffect, useMemo, useState } from 'react';
import { 
  History, 
  Search, 
  MessageSquare, 
  Image as ImageIcon, 
  Code2, 
  Languages, 
  Trash2, 
  ArrowRight,
  Sparkles,
  Pin,
  Pencil,
  Download,
  FileJson,
  FileText,
  Trash
} from 'lucide-react';
import type { Language, AfgChatSession, TabType } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';
import { getIntlLocale } from '../../utils/i18n';
import { apiFetch } from '../../lib/apiClient';

const HISTORY_COPY = {
  dari:{loadError:'بارگذاری تاریخچه از سرور ناموفق بود. اتصال و ورود حساب را بررسی کنید.',openError:'بازکردن گفتگو ناموفق بود. دوباره تلاش کنید.',deleteError:'حذف گفتگو ناموفق بود.',rename:'نام جدید گفتگو',renameError:'تغییر نام گفتگو ناموفق بود.',exportError:'دریافت گفتگو برای خروجی ناموفق بود.',newChat:'گفتگوی جدید',clearConfirm:'تمام گفتگوهای ذخیره‌شده پاک شود؟',clearError:'پاک‌کردن همه گفتگوها ناموفق بود.',clearAll:'پاک‌کردن همه',loading:'در حال بارگذاری تاریخچه...',pin:'سنجاق'},
  english:{loadError:'Could not load server history. Check your connection and sign-in.',openError:'Could not open this conversation. Please try again.',deleteError:'Could not delete this conversation.',rename:'Rename conversation',renameError:'Could not rename this conversation.',exportError:'Could not load this conversation for export.',newChat:'New Chat',clearConfirm:'Delete all saved conversations?',clearError:'Could not clear all conversations.',clearAll:'Clear all',loading:'Loading conversation history...',pin:'Pin'},
  pashto:{loadError:'د سرور تاریخچه نه شوه بارېدای. اړیکه او حساب ته ننوتل وګورئ.',openError:'دا خبرې نه شوې پرانیستل کېدای. بیا هڅه وکړئ.',deleteError:'د خبرو ړنګول ناکام شول.',rename:'د خبرو نوی نوم',renameError:'د خبرو نوم بدل نه شو.',exportError:'د صادرولو لپاره خبرې نه شوې لوستل کېدای.',newChat:'نوې خبرې',clearConfirm:'ټولې خوندي شوې خبرې پاکې شي؟',clearError:'ټولې خبرې پاکې نه شوې.',clearAll:'ټول پاکول',loading:'د خبرو تاریخچه بارېږي...',pin:'سنجاق کول'},
  arabic:{loadError:'تعذر تحميل سجل المحادثات من الخادم. تحقق من الاتصال وتسجيل الدخول.',openError:'تعذر فتح هذه المحادثة. حاول مرة أخرى.',deleteError:'تعذر حذف هذه المحادثة.',rename:'إعادة تسمية المحادثة',renameError:'تعذرت إعادة تسمية المحادثة.',exportError:'تعذر تحميل المحادثة لتصديرها.',newChat:'محادثة جديدة',clearConfirm:'هل تريد حذف جميع المحادثات المحفوظة؟',clearError:'تعذر مسح جميع المحادثات.',clearAll:'مسح الكل',loading:'جارٍ تحميل سجل المحادثات...',pin:'تثبيت'}
} as const;

interface AfgHistoryViewProps {
  language: Language;
  onSelectChat: (session: AfgChatSession) => void;
  onNewChat: () => void;
  activeSessionId: string;
  isAuthenticated?: boolean;
}

export const AfgHistoryView: React.FC<AfgHistoryViewProps> = ({
  language,
  onSelectChat,
  onNewChat,
  activeSessionId,
  isAuthenticated = false,
}) => {
  const t = translations[language];
  const c = HISTORY_COPY[language==='dari'||language==='pashto'||language==='arabic'?language:'english'];
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState<AfgChatSession[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('afg_sessions') || '[]'); return Array.isArray(saved) ? saved.filter((item: any) => typeof item?.id === 'string' && item.id.startsWith('chat-')) : []; }
    catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        const saved = JSON.parse(localStorage.getItem('afg_sessions') || '[]');
        const guestSessions = Array.isArray(saved) ? saved.filter((item: any) => typeof item?.id === 'string' && item.id.startsWith('chat-')) : [];
        setSessions(guestSessions);
        localStorage.setItem('afg_sessions', JSON.stringify(guestSessions));
      }
      catch { setSessions([]); }
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch('/api/conversations')
      .then((response) => response.json())
      .then((payload: any) => {
        if (cancelled) return;
        const rows = Array.isArray(payload.conversations) ? payload.conversations : [];
        setSessions(rows.map((row: any) => ({
          id: String(row.id),
          title: String(row.title || 'New chat'),
          lastMessage: String(row.lastMessage || ''),
          timestamp: new Date(row.updatedAt || row.createdAt || Date.now()).getTime(),
          messages: [],
          category: 'general' as const,
          isPinned: false,
        })));
      })
      .catch(() => {
        if (!cancelled) setError(c.loadError);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, language]);

  useEffect(() => {
    if (!isAuthenticated) localStorage.setItem('afg_sessions', JSON.stringify(sessions));
  }, [sessions, isAuthenticated]);

  const loadSessionMessages = async (session: AfgChatSession): Promise<AfgChatSession> => {
    if (!isAuthenticated || session.id.startsWith('chat-')) return session;
    const response = await apiFetch('/api/conversations/' + encodeURIComponent(session.id) + '/messages');
    const payload = await response.json() as { messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string; status?: string }> };
    const loaded = (payload.messages || []).map((message) => ({
      id: message.id,
      role: message.role,
      isError: message.status === 'failed' || message.status === 'cancelled',
      isCancelled: message.status === 'cancelled',
      content: message.content,
      timestamp: new Date(message.createdAt).getTime(),
    }));
    return { ...session, messages: loaded };
  };

  const handleSelect = async (session: AfgChatSession) => {
    try {
      setError('');
      const loaded = await loadSessionMessages(session);
      onSelectChat(loaded);
    } catch {
      setError(c.openError);
    }
  };

  const filteredSessions = useMemo(() => sessions
    .filter((session) => session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.messages.some((message) => message.content.toLowerCase().includes(searchQuery.toLowerCase())))
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || b.timestamp - a.timestamp),
  [sessions, searchQuery]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setError('');
      if (isAuthenticated && !id.startsWith('chat-')) {
        await apiFetch('/api/conversations/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'X-CSRF-Token': decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '') } });
      }
      setSessions((previous) => previous.filter((session) => session.id !== id));
      if (id === activeSessionId) onNewChat();
    } catch {
      setError(c.deleteError);
    }
  };

  const handleRename = (session: AfgChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const title = window.prompt(c.rename, session.title);
    if (title && title.trim()) {
      const nextTitle = title.trim().slice(0, 180);
      void (async () => {
        try {
          if (isAuthenticated && !session.id.startsWith('chat-')) {
            const csrf = decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '');
            await apiFetch('/api/conversations/' + encodeURIComponent(session.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
              body: JSON.stringify({ title: nextTitle }),
            });
          }
          setSessions((previous) => previous.map((item) => item.id === session.id ? { ...item, title: nextTitle } : item));
        } catch {
          setError(c.renameError);
        }
      })();
    }
  };

  const handlePin = (session: AfgChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((previous) => previous.map((item) => item.id === session.id ? { ...item, isPinned: !item.isPinned } : item));
  };

  const sessionMarkdown = (session: AfgChatSession) => '# ' + session.title + '\n\n' + session.messages.map((message) => '## ' + message.role.toUpperCase() + '\n\n' + message.content).join('\n\n');

  const downloadText = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (session: AfgChatSession, format: 'md' | 'json' | 'pdf', e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const completeSession = await loadSessionMessages(session);
      setSessions((previous) => previous.map((item) => item.id === session.id ? completeSession : item));
      if (format === 'json') downloadText(session.title + '.json', JSON.stringify(completeSession, null, 2), 'application/json');
      else if (format === 'md') downloadText(session.title + '.md', sessionMarkdown(completeSession), 'text/markdown');
      else {
        const popup = window.open('', '_blank');
        if (!popup) return;
        popup.document.title = session.title;
        const heading = popup.document.createElement('h1'); heading.textContent = session.title;
        const pre = popup.document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap'; pre.style.fontFamily = 'Arial, sans-serif';
        pre.textContent = completeSession.messages.map((message) => message.role.toUpperCase() + '\n\n' + message.content).join('\n\n');
        popup.document.body.append(heading, pre); popup.focus(); popup.print();
      }
    } catch {
      setError(c.exportError);
    }
  };

  const getCategoryIcon = (category: AfgChatSession['category']) => {
    switch (category) {
      case 'image': return <ImageIcon className="w-4 h-4 text-purple-400" />;
      case 'code': return <Code2 className="w-4 h-4 text-emerald-400" />;
      case 'translation': return <Languages className="w-4 h-4 text-sky-400" />;
      default: return <MessageSquare className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div dir={['dari','pashto','persian','arabic','urdu'].includes(language) ? "rtl" : "ltr"} className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <History className="w-6 h-6 text-cyan-400" />
          <span>{t.historyTitle}</span>
        </h1>

        <button
          onClick={onNewChat}
          className="px-4 py-2 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md"
        >
          <Sparkles className="w-4 h-4" />
          <span>{c.newChat}</span>
        </button>
      </div>

      {/* Search Input (Screenshot 4) */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.historySearchPlaceholder}
          className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-900/80 border border-cyan-800/40 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 shadow-md"
        />
      </div>

      <div className="flex justify-end">
        <button onClick={() => { if (window.confirm(c.clearConfirm)) { void (async () => {
          try {
            if (isAuthenticated) {
              const csrf = decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice('afg_csrf='.length) || '');
              await Promise.all(sessions.filter((item) => !item.id.startsWith('chat-')).map((item) => apiFetch('/api/conversations/' + encodeURIComponent(item.id), { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } })));
            }
            setSessions([]); onNewChat();
          } catch { setError(c.clearError); }
        })(); } }} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
          <Trash className="w-3.5 h-3.5" />{c.clearAll}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{error}</p>}
      {/* Sessions List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-sm">{c.loading}</div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-sm">
            {t.emptyHistory}
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => { void handleSelect(session); }}
              className="p-4 rounded-2xl bg-[#09122c]/80 hover:bg-[#0e1b3d] border border-cyan-900/40 hover:border-cyan-500/50 cursor-pointer transition-all flex items-center justify-between gap-4 shadow-md group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  {getCategoryIcon(session.category)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {session.isPinned && <Pin className="w-3 h-3 text-amber-300" />}
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                      {session.title}
                    </h3>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Intl.DateTimeFormat(getIntlLocale(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(session.timestamp))}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {session.lastMessage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!isAuthenticated && <button onClick={(e) => handlePin(session, e)} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-300" title={c.pin}><Pin className="w-4 h-4" /></button>}
                <button onClick={(e) => handleRename(session, e)} className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-300" title="Rename"><Pencil className="w-4 h-4" /></button>
                <button onClick={(e) => handleExport(session, 'md', e)} className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-300" title="Export Markdown"><FileText className="w-4 h-4" /></button>
                <button onClick={(e) => handleExport(session, 'json', e)} className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-300" title="Export JSON"><FileJson className="w-4 h-4" /></button>
                <button onClick={(e) => handleExport(session, 'pdf', e)} className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-300" title="Print / Save PDF"><Download className="w-4 h-4" /></button>
                <button
                  onClick={(e) => handleDelete(session.id, e)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ArrowRight className={`w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform ${['dari','pashto','persian','arabic','urdu'].includes(language) ? 'rotate-180 group-hover:-translate-x-1' : ''}`} />
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
