import React, { useState } from 'react';
import { 
  User, 
  Moon, 
  Sun, 
  Globe, 
  Bell, 
  Volume2, 
  Shield, 
  Info, 
  HelpCircle, 
  LogOut, 
  Crown, 
  ChevronRight, 
  ExternalLink,
  Heart,
  Send,
  Github
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { Language, Theme, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgSettingsViewProps {
  language: Language;
  theme: Theme;
  user: UserProfile;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
}

export const AfgSettingsView: React.FC<AfgSettingsViewProps> = ({
  language,
  theme,
  user,
  onToggleLanguage,
  onToggleTheme,
  onOpenShortcuts,
}) => {
  const t = translations[language];
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [showAboutModal, setShowAboutModal] = useState(false);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
      {/* Page Title */}
      <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
        <span>{t.settingsTitle}</span>
      </h1>

      {/* User Profile Card (Matching Screenshot 2) */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-[#0c1a40] to-[#07112c] border border-cyan-500/40 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.4)]"
            />
            <span className="absolute -top-1 -right-1 bg-amber-400 text-amber-950 p-1 rounded-full shadow">
              <Crown className="w-3.5 h-3.5 fill-current" />
            </span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              {language === 'dari' ? user.name : user.nameEn}
            </h2>
            <p className="text-xs text-slate-400">
              {user.email}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                {t.premiumUser}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Options List */}
      <div className="rounded-3xl bg-[#09122c]/90 border border-cyan-900/40 overflow-hidden divide-y divide-cyan-950/60 shadow-xl">
        
        {/* Language Option */}
        <div 
          onClick={onToggleLanguage}
          className="p-4 flex items-center justify-between hover:bg-cyan-950/30 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {t.appLanguage}
              </span>
              <span className="text-xs text-slate-400">
                {language === 'dari' ? 'فارسی / دری (افغانستان)' : 'English (US)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-cyan-300 font-bold bg-cyan-500/15 px-2.5 py-1 rounded-lg">
              {language === 'dari' ? 'دری' : 'English'}
            </span>
            <ChevronRight className={`w-4 h-4 text-slate-500 ${language === 'dari' ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Theme Mode Option */}
        <div 
          onClick={onToggleTheme}
          className="p-4 flex items-center justify-between hover:bg-cyan-950/30 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {t.darkMode}
              </span>
              <span className="text-xs text-slate-400">
                {theme === 'dark' ? 'Dark Mode (Active)' : 'Light Mode (Active)'}
              </span>
            </div>
          </div>

          <div className={`w-12 h-6 rounded-full p-1 transition-colors ${theme === 'dark' ? 'bg-cyan-500' : 'bg-slate-700'}`}>
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* Notifications Toggle */}
        <div 
          onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          className="p-4 flex items-center justify-between hover:bg-cyan-950/30 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {t.notifications}
              </span>
              <span className="text-xs text-slate-400">
                {notificationsEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          <div className={`w-12 h-6 rounded-full p-1 transition-colors ${notificationsEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}>
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* Sound Effects Toggle */}
        <div 
          onClick={() => setSoundsEnabled(!soundsEnabled)}
          className="p-4 flex items-center justify-between hover:bg-cyan-950/30 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {t.soundEffects}
              </span>
              <span className="text-xs text-slate-400">
                {soundsEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          <div className={`w-12 h-6 rounded-full p-1 transition-colors ${soundsEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}>
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${soundsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* Keyboard Shortcuts Trigger (preserves request #9) */}
        <div 
          onClick={onOpenShortcuts}
          className="p-4 flex items-center justify-between hover:bg-cyan-950/30 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {language === 'dari' ? 'کلیدهای میانبر کیبورد' : 'Keyboard Shortcuts'}
              </span>
              <span className="text-xs text-slate-400">
                Ctrl + /
              </span>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-500 ${language === 'dari' ? 'rotate-180' : ''}`} />
        </div>

        {/* About AFG AI Modal Trigger (Screenshot 4) */}
        <div 
          onClick={() => setShowAboutModal(true)}
          className="p-4 flex items-center justify-between hover:bg-cyan-950/30 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {t.aboutUs}
              </span>
              <span className="text-xs text-slate-400">
                {t.aboutVersion}
              </span>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-500 ${language === 'dari' ? 'rotate-180' : ''}`} />
        </div>

      </div>

      {/* Logout Button */}
      <button 
        onClick={() => alert(language === 'dari' ? 'شما با موفقیت خارج شدید.' : 'Logged out successfully.')}
        className="w-full py-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        <span>{t.logout}</span>
      </button>

      {/* About AFG AI Modal (Screenshot 4) */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#09122c] border border-cyan-500/40 p-6 shadow-2xl text-center space-y-4 relative">
            <button
              onClick={() => setShowAboutModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <AfgBrainLogo size="lg" showBadge className="mx-auto" />
            <h2 className="text-2xl font-black text-white">
              {t.brandName}
            </h2>
            <span className="inline-block px-3 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold">
              {t.aboutVersion}
            </span>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed text-right sm:text-center">
              {t.aboutDescription}
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
              >
                <Github className="w-4 h-4 text-cyan-400" />
                <span>{t.github}</span>
              </a>
              <a
                href="https://t.me"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
              >
                <Send className="w-4 h-4 text-sky-400" />
                <span>{t.telegram}</span>
              </a>
            </div>

            <div className="pt-4 border-t border-cyan-950 text-[11px] text-slate-400 flex flex-col items-center gap-1">
              <span className="flex items-center gap-1 text-slate-300">
                {t.madeWithLove}
              </span>
              <span>{t.allRightsReserved}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
