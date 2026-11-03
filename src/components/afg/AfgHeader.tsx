import React, { useState } from 'react';
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
  MoreVertical
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { Language, Theme, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

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
  const [modelsMenuOpen, setModelsMenuOpen] = useState(false);

  return (
    <header className="afg-app-header sticky top-0 z-40 w-full backdrop-blur-xl bg-[#060b18]/85 dark:bg-[#060b18]/90 light:bg-white/90 border-b border-cyan-900/30 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left Section: Menu Toggle + Brand Logo & Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenMenu}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 focus:outline-none transition-colors"
            title="Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <AfgBrainLogo size="sm" showBadge={false} />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-cyan-200 to-sky-400 bg-clip-text text-transparent">
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

          <button type="button" onClick={onNewChat} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-800/40 bg-cyan-500/10 px-2.5 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20" aria-label={language === 'dari' ? 'گفت‌وگوی جدید' : 'New chat'} title={language === 'dari' ? 'گفت‌وگوی جدید' : 'New chat'}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'dari' ? 'گفت‌وگوی جدید' : 'New chat'}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={onToggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-cyan-300 border border-cyan-800/40 transition-colors"
            title="Switch Language / تغییر زبان"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs">
              {language === 'dari' ? 'دری' : 'English'}
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

          <div className="relative"><button type="button" onClick={() => setModelsMenuOpen(value => !value)} aria-label={language === 'dari' ? 'گزینه‌های بیشتر' : 'More options'} aria-expanded={modelsMenuOpen} className="rounded-xl border border-slate-700/40 bg-slate-800/60 p-2 text-slate-300 transition hover:bg-slate-700/70 hover:text-white"><MoreVertical className="h-4 w-4" /></button>{modelsMenuOpen && <div className="absolute end-0 top-12 z-50 min-w-40 rounded-xl border border-cyan-900/40 bg-[#081326] p-1 shadow-2xl"><button type="button" onClick={() => { setModelsMenuOpen(false); onOpenModels?.(); }} className="w-full rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-cyan-100 hover:bg-cyan-500/15">{language === 'dari' ? 'مدل‌ها' : 'Models'}</button></div>}</div>

        </div>

      </div>
    </header>
  );
};
