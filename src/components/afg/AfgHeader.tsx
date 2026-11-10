import React, { useEffect, useRef, useState } from 'react';
import { 
  Menu, 
  Bell, 
  Sun, 
  Moon, 
  Globe, 
  Crown,
  Sparkles,
  CheckCircle2,
  Plus,
  MoreVertical,
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { Language, Theme, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

const HEADER_COPY = {
  dari:{menu:'بازکردن منو',newChat:'گفت‌وگوی جدید',more:'گزینه‌های بیشتر',models:'کتابخانه مدل‌ها',settings:'تنظیمات',language:'دری'},
  english:{menu:'Open navigation menu',newChat:'New chat',more:'More options',models:'Model library',settings:'Settings',language:'English'},
  pashto:{menu:'د لارښود مینو پرانیستل',newChat:'نوې خبرې',more:'نور انتخابونه',models:'د ماډلونو کتابتون',settings:'امستنې',language:'پښتو'},
  arabic:{menu:'فتح قائمة التنقل',newChat:'محادثة جديدة',more:'خيارات إضافية',models:'مكتبة النماذج',settings:'الإعدادات',language:'العربية'}
} as const;

interface AfgHeaderProps {
  language: Language;
  theme: Theme;
  user: UserProfile;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenMenu: () => void;
  onNewChat: () => void;
  onOpenModels?: () => void;
  unreadNotifications?: number;
}

export const AfgHeader: React.FC<AfgHeaderProps> = ({
  language,
  theme,
  user,
  onToggleLanguage,
  onToggleTheme,
  onOpenSettings,
  onOpenMenu,
  onNewChat,
  onOpenModels,
  unreadNotifications = 0,
}) => {
  const t = translations[language];
  const c = HEADER_COPY[language==='dari'||language==='pashto'||language==='arabic'?language:'english'];
  const [modelsMenuOpen, setModelsMenuOpen] = useState(false);
  const modelsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelsMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (modelsMenuRef.current && !modelsMenuRef.current.contains(event.target as Node)) {
        setModelsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setModelsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modelsMenuOpen]);
  const [connection, setConnection] = useState<'live'|'degraded'|'offline'|'connecting'>(() => (document.documentElement.dataset.afgConnection as any) || 'connecting');
  useEffect(() => {
    const update = (event: Event) => setConnection((event as CustomEvent<string>).detail as any);
    window.addEventListener('afg-connection-state', update);
    return () => window.removeEventListener('afg-connection-state', update);
  }, []);

  return (
    <header className="afg-app-header sticky top-0 z-40 w-full backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left Section: Menu Toggle + Brand Logo & Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenMenu}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 focus:outline-none transition-colors"
            title={c.menu}
            aria-label={c.menu}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <AfgBrainLogo size="sm" showBadge={false} />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-[var(--text-primary)]">
                  {t.brandName}
                </span>
                <span className="text-xs">🇦🇫</span>
              </div>
              <span className="hidden md:inline-block text-[11px] text-cyan-400/80 font-medium tracking-wide">
                {t.brandSubtitle}
              </span>
            </div>
          </div>
        </div>

        {/* Right Section: Language Switch, Theme, Notifications & User Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">

          <div className={'afg-connection-indicator hidden sm:flex ' + (connection==='live'?'is-live':connection==='offline'?'is-offline':'is-degraded')} title={connection==='live'?'API and model catalogue reachable':connection==='offline'?'No network connection':'Connection is being checked'}><span className="afg-connection-dot"/>{connection==='live'?'Live':connection==='offline'?'Offline':connection==='connecting'?'Connecting':'Degraded'}</div>

          <button type="button" onClick={onNewChat} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-800/40 bg-cyan-500/10 px-2.5 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20" aria-label={c.newChat} title={c.newChat}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{c.newChat}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={onToggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-cyan-300 border border-cyan-800/40 transition-colors"
            title="Switch Language / تغییر زبان"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs">
              {c.language}
            </span>
          </button>

          {/* Theme Toggle (Dark/Light) */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/70 border border-slate-700/40 transition-colors"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-300" />
            ) : (
              <Moon className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          <div className="relative" ref={modelsMenuRef}>
            <button type="button" onClick={() => setModelsMenuOpen(value => !value)} aria-label={c.more} aria-expanded={modelsMenuOpen} aria-haspopup="menu" aria-controls="afg-header-more-menu" className="grid h-11 w-11 place-items-center rounded-full border border-slate-700/40 bg-slate-800/60 text-slate-300 transition hover:bg-slate-700/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"><MoreVertical className="h-5 w-5" /></button>
            {modelsMenuOpen && <div id="afg-header-more-menu" role="menu" className="absolute end-0 top-12 z-[100] min-w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#101d32]">
              <button type="button" role="menuitem" onClick={() => { setModelsMenuOpen(false); onOpenModels?.(); }} className="flex min-h-11 w-full items-center rounded-xl px-3 text-start text-sm font-semibold text-slate-800 transition hover:bg-cyan-500/10 dark:text-cyan-100">{c.models}</button>
              <button type="button" role="menuitem" onClick={() => { setModelsMenuOpen(false); onOpenSettings(); }} className="flex min-h-11 w-full items-center rounded-xl px-3 text-start text-sm font-semibold text-slate-800 transition hover:bg-cyan-500/10 dark:text-cyan-100">{c.settings}</button>
            </div>}
          </div>

        </div>

      </div>
    </header>
  );
};
