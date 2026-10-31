import React from 'react';
import { 
  X, 
  Home, 
  MessageSquare, 
  Image as ImageIcon, 
  Code2, 
  Wrench, 
  Settings, 
  LogOut, 
  Crown,
  History,
  ShieldAlert
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { TabType, Language, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgSideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  language: Language;
  user: UserProfile;
}

export const AfgSideMenu: React.FC<AfgSideMenuProps> = ({
  isOpen,
  onClose,
  currentTab,
  onChangeTab,
  language,
  user,
}) => {
  if (!isOpen) return null;

  const t = translations[language];

  const menuItems = [
    { id: 'home' as TabType, label: t.navHome, icon: Home },
    { id: 'chat' as TabType, label: t.navChat, icon: MessageSquare },
    { id: 'image-gen' as TabType, label: t.navImage, icon: ImageIcon },
    { id: 'tools' as TabType, label: t.navTools, icon: Wrench },
    { id: 'history' as TabType, label: t.navHistory, icon: History },
    { id: 'settings' as TabType, label: t.navSettings, icon: Settings },
    { id: 'admin' as TabType, label: t.navAdmin, icon: ShieldAlert },
  ];

  const handleSelect = (id: TabType) => {
    onChangeTab(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Container (Right side in RTL, Left side in LTR) */}
      <div 
        className={`relative z-10 w-72 sm:w-80 h-full bg-[#081129] border-cyan-900/40 p-5 flex flex-col justify-between shadow-2xl ${
          language === 'dari' ? 'mr-auto border-l' : 'ml-auto border-r'
        }`}
      >
        <div>
          {/* Top Header with Close Button */}
          <div className="flex items-center justify-between pb-4 border-b border-cyan-950">
            <div className="flex items-center gap-2">
              <AfgBrainLogo size="sm" showBadge={false} />
              <span className="text-lg font-black text-white">
                {t.brandName}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Card (Screenshot 4) */}
          <div className="mt-4 p-3 rounded-2xl bg-cyan-950/30 border border-cyan-800/30 flex items-center gap-3">
            <div className="relative">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-11 h-11 rounded-xl object-cover ring-2 ring-cyan-400"
              />
              <span className="absolute -top-1 -right-1 bg-amber-400 text-amber-950 p-0.5 rounded-full">
                <Crown className="w-2.5 h-2.5 fill-current" />
              </span>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate">
                {language === 'dari' ? user.name : user.nameEn}
              </h4>
              <p className="text-[10px] text-cyan-300">
                {t.premiumUser}
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="mt-5 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer with Logout */}
        <div className="pt-4 border-t border-cyan-950">
          <button
            onClick={() => {
              alert(language === 'dari' ? 'شما با موفقیت خارج شدید.' : 'Logged out successfully.');
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.logout}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
