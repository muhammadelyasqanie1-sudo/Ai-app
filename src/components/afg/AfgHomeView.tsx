import React, { useState } from 'react';
import { 
  MessageSquare, 
  Image as ImageIcon, 
  Video, 
  Code2, 
  Languages, 
  FileText, 
  FolderArchive, 
  Mic, 
  Grid, 
  ArrowRight, 
  Sparkles, 
  Search, 
  Crown, 
  ShieldCheck, 
  Zap, 
  Heart,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import type { TabType, Language, UserProfile, AfgCapabilityKey } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgHomeViewProps {
  language: Language;
  user: UserProfile;
  onChangeTab: (tab: TabType) => void;
  onStartChatWithPrompt?: (prompt: string) => void;
  capabilities: Record<AfgCapabilityKey, boolean>;
  announcements?: Array<{id:string;title:string;body:string;created_at:string}>;
}

export const AfgHomeView: React.FC<AfgHomeViewProps> = ({
  language,
  user,
  onChangeTab,
  onStartChatWithPrompt,
  capabilities,
  announcements = [],
}) => {
  const t = translations[language];
  const [quickQuery, setQuickQuery] = useState('');

  const handleQuickAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickQuery.trim()) {
      if (onStartChatWithPrompt) {
        onStartChatWithPrompt(quickQuery);
      } else {
        onChangeTab('chat');
      }
    }
  };

  const coreTools = [
    {
      id: 'image-gen' as TabType,
      title: language === 'dari' ? 'ساخت عکس' : 'Create Image',
      desc: language === 'dari' ? 'تا اتصال ارائه‌دهنده تولید تصویر غیرفعال' : 'Unavailable until an image provider is connected',
      icon: ImageIcon,
      color: 'from-blue-500 to-cyan-400',
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
    },
    {
      id: 'video-gen' as TabType,
      title: language === 'dari' ? 'ساخت ویدیو' : 'Create Video',
      desc: language === 'dari' ? 'تا اتصال ارائه‌دهنده تولید ویدیو غیرفعال' : 'Unavailable until a video provider is connected',
      icon: Video,
      color: 'from-purple-500 to-indigo-500',
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
    },
    {
      id: 'chat' as TabType,
      title: language === 'dari' ? 'گفت‌وگوی هوش مصنوعی' : 'AI Chat',
      desc: capabilities.chat ? (language === 'dari' ? 'مدل گفت‌وگوی تأییدشده فعال است' : 'Verified chat model available') : (language === 'dari' ? 'مدل تأییدشده در دسترس نیست' : 'No verified chat model available'),
      icon: Code2,
      color: 'from-emerald-500 to-teal-400',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
    },
    {
      id: 'tools' as TabType,
      title: language === 'dari' ? 'ترجمه هوشمند' : 'Translate',
      desc: language === 'dari' ? 'ارائه‌دهنده ترجمه تنظیم نشده است' : 'Translation provider is not configured',
      icon: Languages,
      color: 'from-sky-500 to-blue-600',
      textColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/30',
    },
    {
      id: 'tools' as TabType,
      title: language === 'dari' ? 'ابزار PDF' : 'PDF Tools',
      desc: language === 'dari' ? 'بارگذاری و پردازش سند فعال نیست' : 'Document upload and processing are unavailable',
      icon: FileText,
      color: 'from-rose-500 to-pink-500',
      textColor: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/30',
    },
    {
      id: 'tools' as TabType,
      title: language === 'dari' ? 'صدا و گفتار' : 'Voice Tools',
      desc: language === 'dari' ? 'ورودی گفتار مرورگر؛ بدون TTS سرور' : 'Browser speech input only; no server TTS',
      icon: Mic,
      color: 'from-amber-500 to-orange-400',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
    },
    {
      id: 'tools' as TabType,
      title: language === 'dari' ? 'مدیریت فایل' : 'File Tools',
      desc: language === 'dari' ? 'پردازش فایل هنوز پیاده‌سازی نشده' : 'File processing is not implemented',
      icon: FolderArchive,
      color: 'from-teal-500 to-emerald-500',
      textColor: 'text-teal-400',
      bgColor: 'bg-teal-500/10',
      borderColor: 'border-teal-500/30',
    },
    {
      id: 'tools' as TabType,
      title: language === 'dari' ? 'بیشتر ابزارها' : 'More Tools',
      desc: language === 'dari' ? 'محاسبه‌گر، QR و موارد دیگر' : 'Calc, QR & All Tools',
      icon: Grid,
      color: 'from-indigo-500 to-purple-600',
      textColor: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/30',
    },
  ];

  return (
    <div className="afg-home-view w-full max-w-6xl mx-auto px-4 py-4 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {announcements.length > 0 && <section aria-label={language === 'dari' ? 'اطلاعیه‌های AFG AI' : 'AFG AI announcements'} className="space-y-2">
        {announcements.map(item => <article key={item.id} className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-300"><Sparkles className="h-4 w-4"/>{language === 'dari' ? 'اطلاعیه AFG AI' : 'AFG AI announcement'}</div>
          <h2 className="mt-2 text-sm font-bold text-white">{item.title}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{item.body}</p>
        </article>)}
      </section>}
      
      {/* Hero Welcome Card with Afghan Landmark Illustration Backdrop (Screenshot 2 & 3) */}
      <div className="afg-home-hero relative overflow-hidden rounded-3xl border p-5 sm:p-8">
        
        {/* Background Afghan Mountains & Citadel SVG Graphic */}
        <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-screen overflow-hidden">
          <svg viewBox="0 0 1000 300" fill="none" className="w-full h-full object-cover">
            {/* Mountains Silhouette */}
            <path d="M0 250 L120 160 L240 220 L380 120 L500 200 L650 90 L800 210 L920 140 L1000 250 L1000 300 L0 300 Z" fill="#00b4d8" />
            <path d="M100 250 L260 170 L400 240 L550 140 L700 220 L850 130 L1000 230 L1000 300 L100 300 Z" fill="#0077b6" opacity="0.6" />
            {/* Herat Citadel / Historic Towers Silhouette */}
            <rect x="220" y="190" width="40" height="60" fill="#03045e" rx="4" />
            <rect x="270" y="180" width="50" height="70" fill="#03045e" rx="4" />
            <rect x="330" y="195" width="35" height="55" fill="#03045e" rx="4" />
          </svg>
        </div>

        {/* Ambient Top Glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/20 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          
          {/* User Info & Greeting */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.5)]"
              />
              <span className="absolute -bottom-1 -right-1 bg-gradient-to-r from-amber-400 to-amber-600 text-amber-950 p-1 rounded-full shadow-md">
                <Crown className="w-3.5 h-3.5 fill-current" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {language === 'dari' ? user.name : user.nameEn}
                </h1>
                <span className="text-sm">👋</span>
              </div>
              <p className="text-xs sm:text-sm text-cyan-300 font-medium mt-0.5">
                {t.welcomeBack}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${capabilities.chat ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-amber-500/15 border-amber-500/40 text-amber-300'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${capabilities.chat ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`} />
                  {capabilities.chat ? (language === 'dari' ? 'گفت‌وگو تأیید شد' : 'Chat verified') : (language === 'dari' ? 'مدل هوش مصنوعی در دسترس نیست' : 'AI provider unavailable')}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-300">
                  <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                  {language === 'dari' ? 'حساب مهمان • رایگان' : user.tier}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Instant Search / Ask Anything Bar (Screenshot 3) */}
        <form onSubmit={handleQuickAsk} className="mt-6 relative">
          <div className="relative flex items-center rounded-2xl bg-slate-900/90 border border-cyan-500/40 shadow-[0_4px_20px_rgba(0,0,0,0.5)] focus-within:border-cyan-400 focus-within:shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all">
            <Search className="w-5 h-5 text-cyan-400 ml-4 shrink-0" />
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder={t.askAnythingPlaceholder}
              className="w-full py-3.5 px-3 bg-transparent text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              className="mr-2 px-4 py-2 rounded-xl gradient-btn-cyan text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shrink-0"
            >
              <span>{language === 'dari' ? 'بپرس' : 'Ask'}</span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

      </div>

      {/* Quick Access Section (Matching Screenshot 3) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            {t.quickAccess}
          </h2>
          <button 
            onClick={() => onChangeTab('tools')}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            <span>{t.seeAll}</span>
            <ArrowRight className={`w-3.5 h-3.5 ${language === 'dari' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          
          {/* Card 1: AI Chat */}
          <div
            onClick={() => onChangeTab('chat')}
            className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-[#0c1c44] to-[#08122c] border border-cyan-500/40 hover:border-cyan-400 hover:scale-102 cursor-pointer transition-all shadow-[0_8px_25px_rgba(0,0,0,0.4)] group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  {t.toolChat}
                </h3>
                <p className="text-xs text-cyan-300/80">
                  {t.smartChatDesc}
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Image Gen */}
          <div
            onClick={() => onChangeTab('image-gen')}
            className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-[#1b1244] to-[#0d0a2c] border border-purple-500/40 hover:border-purple-400 hover:scale-102 cursor-pointer transition-all shadow-[0_8px_25px_rgba(0,0,0,0.4)] group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  {t.toolImageGen}
                </h3>
                <p className="text-xs text-purple-300/80">
                  {language === 'dari' ? 'تا تأیید قابلیت تولید تصویر غیرفعال' : 'Unavailable until image generation is verified'}
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Video Gen */}
          <div
            onClick={() => onChangeTab('video-gen')}
            className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-[#1e1338] to-[#0f0924] border border-pink-500/40 hover:border-pink-400 hover:scale-102 cursor-pointer transition-all shadow-[0_8px_25px_rgba(0,0,0,0.4)] group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 group-hover:scale-110 transition-transform">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  {t.toolVideoGen}
                </h3>
                <p className="text-xs text-pink-300/80">
                  {language === 'dari' ? 'تا تأیید قابلیت تولید ویدیو غیرفعال' : 'Unavailable until video generation is verified'}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Grid of Core Tools (Matching Screenshot 2 & 3) */}
      <div>
        <h2 className="text-base sm:text-lg font-bold text-white mb-3 px-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          {t.toolsCenter}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {coreTools.map((tool, idx) => {
            const Icon = tool.icon;
            return (
              <div
                key={idx}
                onClick={() => onChangeTab(tool.id)}
                className={`p-4 rounded-2xl bg-[#091126]/80 hover:bg-[#0d1838] border ${tool.borderColor} hover:scale-103 cursor-pointer transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] group flex flex-col items-center sm:items-start text-center sm:text-left`}
              >
                <div className={`w-12 h-12 rounded-2xl ${tool.bgColor} flex items-center justify-center ${tool.textColor} mb-3 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                  {tool.title}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  {tool.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      

      {/* Trust & Performance Pillars (Matching Screenshot 3 Bottom Bar) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-cyan-900/40">
          <Zap className="w-5 h-5 text-cyan-400 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-white">{language === 'dari' ? 'وضعیت ارائه‌دهنده' : 'Provider status'}</h4>
            <p className="text-[10px] text-slate-400">{capabilities.chat ? (language === 'dari' ? 'گفت‌وگو تأیید شده' : 'Chat verified') : (language === 'dari' ? 'تأیید نشده' : 'Not verified')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-cyan-900/40">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-white">{language === 'dari' ? 'کلیدهای سمت سرور' : 'Server-side secrets'}</h4>
            <p className="text-[10px] text-slate-400">{language === 'dari' ? 'کلیدها در سرور نگهداری می‌شوند' : 'Provider keys stay on server'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-cyan-900/40">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-white">{language === 'dari' ? 'قابلیت‌های تأییدشده' : 'Verified capabilities'}</h4>
            <p className="text-[10px] text-slate-400">{language === 'dari' ? 'فقط قابلیت‌های پشتیبانی‌شده فعال‌اند' : 'Only supported features are enabled'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-cyan-900/40">
          <Heart className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-white">Made with Pride 🇦🇫</h4>
            <p className="text-[10px] text-slate-400">For Afghanistan</p>
          </div>
        </div>
      </div>

    </div>
  );
};
