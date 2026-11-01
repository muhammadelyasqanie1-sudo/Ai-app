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

interface AfgHistoryViewProps {
  language: Language;
  onSelectChat: (session: AfgChatSession) => void;
  onNewChat: () => void;
}

export const AfgHistoryView: React.FC<AfgHistoryViewProps> = ({
  language,
  onSelectChat,
  onNewChat,
}) => {
  const t = translations[language];
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState<AfgChatSession[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('afg_sessions') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });

  useEffect(() => { localStorage.setItem('afg_sessions', JSON.stringify(sessions)); }, [sessions]);

  const filteredSessions = useMemo(() => sessions
    .filter((session) => session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.messages.some((message) => message.content.toLowerCase().includes(searchQuery.toLowerCase())))
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || b.timestamp - a.timestamp),
  [sessions, searchQuery]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
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
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
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
          <span>{language === 'dari' ? 'گفتگوی جدید' : 'New Chat'}</span>
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

      {/* Sessions List */}
      <div className="space-y-3">
        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-sm">
            {t.emptyHistory}
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectChat(session)}
              className="p-4 rounded-2xl bg-[#09122c]/80 hover:bg-[#0e1b3d] border border-cyan-900/40 hover:border-cyan-500/50 cursor-pointer transition-all flex items-center justify-between gap-4 shadow-md group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  {getCategoryIcon(session.category)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                      {session.title}
                    </h3>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {session.lastMessage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => handleDelete(session.id, e)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ArrowRight className={`w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform ${language === 'dari' ? 'rotate-180 group-hover:-translate-x-1' : ''}`} />
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
