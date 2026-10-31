import React, { useState } from 'react';
import { 
  History, 
  Search, 
  MessageSquare, 
  Image as ImageIcon, 
  Code2, 
  Languages, 
  Trash2, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import type { Language, AfgChatSession, TabType } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgHistoryViewProps {
  language: Language;
  onSelectChat: (session: AfgChatSession) => void;
  onNewChat: () => void;
}

const SEED_SESSIONS: AfgChatSession[] = [
  {
    id: 'hist-1',
    title: 'آینده هوش مصنوعی',
    titleDari: 'آینده هوش مصنوعی',
    lastMessage: 'آینده هوش مصنوعی بسیار روشن است و در زمینه‌های آموزش، سلامت، کشاورزی تحولات بزرگی ایجاد خواهد کرد.',
    timestamp: Date.now() - 1000 * 60 * 18,
    category: 'general',
    messages: [
      { id: '1', role: 'user', content: 'در مورد آینده هوش مصنوعی توضیح بده', timestamp: Date.now() - 1000 * 60 * 18 },
      { id: '2', role: 'assistant', content: 'آینده هوش مصنوعی بسیار روشن است و در زمینه‌های آموزش، سلامت، کشاورزی و اقتصاد افغانستان تحولات شگرفی ایجاد می‌کند.', timestamp: Date.now() - 1000 * 60 * 17 },
    ],
  },
  {
    id: 'hist-2',
    title: 'تولید تصویر کوهستان',
    titleDari: 'تولید تصویر کوهستان',
    lastMessage: 'یک کوهستان زیبا در افغانستان با برف و آسمان آبی و انعکاس در دریاچه فیروزه‌ای.',
    timestamp: Date.now() - 1000 * 60 * 75,
    category: 'image',
    messages: [
      { id: '3', role: 'user', content: 'تولید تصویر کوهستان پامیر با برف و آسمان صاف', timestamp: Date.now() - 1000 * 60 * 75 },
    ],
  },
  {
    id: 'hist-3',
    title: 'ترجمه متن انگلیسی',
    titleDari: 'ترجمه متن انگلیسی',
    lastMessage: 'Hello, how are you? -> سلام، حال شما چطور است؟',
    timestamp: Date.now() - 1000 * 60 * 140,
    category: 'translation',
    messages: [
      { id: '4', role: 'user', content: 'Translate "Hello, how are you today?" to Dari', timestamp: Date.now() - 1000 * 60 * 140 },
    ],
  },
  {
    id: 'hist-4',
    title: 'راهنمای برنامه و امکانات AFG AI',
    titleDari: 'راهنمای برنامه',
    lastMessage: 'این برنامه یک دستیار هوشمند نسل جدید برای کاربران افغانستانی است.',
    timestamp: Date.now() - 1000 * 60 * 300,
    category: 'general',
    messages: [
      { id: '5', role: 'user', content: 'چه کارهایی می‌توانی انجام دهی؟', timestamp: Date.now() - 1000 * 60 * 300 },
    ],
  },
];

export const AfgHistoryView: React.FC<AfgHistoryViewProps> = ({
  language,
  onSelectChat,
  onNewChat,
}) => {
  const t = translations[language];
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState<AfgChatSession[]>(SEED_SESSIONS);

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
