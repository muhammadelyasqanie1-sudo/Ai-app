import React from 'react';
import { 
  Home, 
  MessageSquare, 
  Wrench, 
  Wallet, 
  User, 
  Sparkles,
  History,
  Image as ImageIcon,
  Video
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { TabType, Language } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgNavigationProps {
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  language: Language;
}

export const AfgNavigation: React.FC<AfgNavigationProps> = ({
  currentTab,
  onChangeTab,
  language,
}) => {
  const t = translations[language];

  const navItems = [
    { id: 'home' as TabType, label: t.navHome, icon: Home },
    { id: 'chat' as TabType, label: t.navChat, icon: MessageSquare },
    { id: 'image-gen' as TabType, label: t.navImage, icon: ImageIcon },
    { id: 'tools' as TabType, label: t.navTools, icon: Wrench },
    { id: 'wallet' as TabType, label: t.navWallet, icon: Wallet },
    { id: 'history' as TabType, label: t.navHistory, icon: History },
  ];

  return (
    <>
      {/* Mobile Bottom Navigation Bar (Matching Screenshots 2, 3, 4) */}
      <nav 
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#060b18]/95 backdrop-blur-xl border-t border-cyan-900/40 px-2 py-1 shadow-[0_-5px_25px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center justify-around relative">
          
          {/* Home */}
          <button
            onClick={() => onChangeTab('home')}
            className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition-all ${
              currentTab === 'home' 
                ? 'text-cyan-400 font-bold scale-105' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{t.navHome}</span>
          </button>

          {/* Chat */}
          <button
            onClick={() => onChangeTab('chat')}
            className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition-all ${
              currentTab === 'chat' 
                ? 'text-cyan-400 font-bold scale-105' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{t.navChat}</span>
          </button>

          {/* Central Floating Glowing AFG AI Brain Button (Signature feature in all mockups) */}
          <div className="relative -top-5">
            <button
              onClick={() => onChangeTab(currentTab === 'chat' ? 'image-gen' : 'chat')}
              className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 via-sky-400 to-indigo-600 p-[3px] shadow-[0_0_25px_rgba(0,229,255,0.7)] hover:scale-110 active:scale-95 transition-all group"
              title="Instant AFG AI"
              aria-label="AFG AI Hub"
            >
              <div className="w-full h-full rounded-full bg-[#070e24] flex items-center justify-center relative overflow-hidden group-hover:bg-[#0b1638] transition-colors">
                <div className="absolute inset-0 bg-cyan-400/20 blur-md rounded-full pointer-events-none" />
                <AfgBrainLogo size="sm" showBadge={false} />
              </div>
            </button>
          </div>

          {/* Tools */}
          <button
            onClick={() => onChangeTab('tools')}
            className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition-all ${
              currentTab === 'tools' 
                ? 'text-cyan-400 font-bold scale-105' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{t.navTools}</span>
          </button>

          {/* Profile / Settings */}
          <button
            onClick={() => onChangeTab('settings')}
            className={`flex flex-col items-center py-1.5 px-2 rounded-xl transition-all ${
              currentTab === 'settings' 
                ? 'text-cyan-400 font-bold scale-105' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{t.navProfile}</span>
          </button>

        </div>
      </nav>

      {/* Desktop Sub-Header Navigation Bar */}
      <div className="hidden md:block w-full bg-[#0a1226]/80 backdrop-blur-md border-b border-cyan-950/40">
        <div className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onChangeTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onChangeTab('video-gen')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                currentTab === 'video-gen'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-purple-300'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.toolVideoGen}</span>
            </button>

            <button
              onClick={() => onChangeTab('admin')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                currentTab === 'admin'
                  ? 'bg-slate-700 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.navAdmin}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
