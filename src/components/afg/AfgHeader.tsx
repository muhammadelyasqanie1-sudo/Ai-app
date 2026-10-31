import React from 'react';
import { 
  Menu, 
  Bell, 
  Sun, 
  Moon, 
  Globe, 
  Crown,
  Sparkles,
  CheckCircle2
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
  unreadNotifications = 1,
}) => {
  const t = translations[language];

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#060b18]/85 dark:bg-[#060b18]/90 light:bg-white/90 border-b border-cyan-900/30 transition-colors">
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

        {/* Center Section: Server Status Ready Pill (from Screenshot 1) */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span className="text-xs font-medium text-emerald-400 tracking-wide flex items-center gap-1">
            {t.serverReady}
          </span>
        </div>

        {/* Right Section: Language Switch, Theme, Notifications & User Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">

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

          {/* Notifications Bell */}
          <button
            onClick={onOpenSettings}
            className="relative p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/70 border border-slate-700/40 transition-colors"
            title="Notifications"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4 text-cyan-300" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
            )}
          </button>
        </div>

      </div>
    </header>
  );
};
