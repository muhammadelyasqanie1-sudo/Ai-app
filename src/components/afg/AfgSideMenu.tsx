import React, { useEffect, useState } from 'react';
import {
  X, Home, MessageSquare, Image as ImageIcon, Wrench, Settings,
  History, ShieldAlert, Video, Terminal, BookOpen, FolderOpen,
  ChevronDown, Sparkles, UserRound, Compass, BrainCircuit
} from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { TabType, Language, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgSideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onNewChat: () => void;
  language: Language;
  user: UserProfile;
}

export const AfgSideMenu: React.FC<AfgSideMenuProps> = ({
  isOpen, onClose, currentTab, onChangeTab, onNewChat, language, user,
}) => {
  const [toolsExpanded, setToolsExpanded] = useState(true);
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  useEffect(() => {
    if (isOpen) { setIsMounted(true); setIsClosing(false); return; }
    if (!isMounted) return;
    setIsClosing(true);
    const timer = window.setTimeout(() => { setIsMounted(false); setIsClosing(false); }, 230);
    return () => window.clearTimeout(timer);
  }, [isOpen, isMounted]);
  if (!isMounted) return null;

  const dari = language === 'dari';
  const t = translations[language];
  const select = (tab: TabType) => { onChangeTab(tab); onClose(); };
  const itemClass = (active: boolean) =>
    `group flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start text-sm font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
      active
        ? 'border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 shadow-[inset_0_0_18px_rgba(34,211,238,.06)]'
        : 'border border-transparent text-slate-300 hover:border-white/5 hover:bg-white/[0.06] hover:text-white'
    }`;

  const mainItems = [
    { id: 'home' as TabType, label: dari ? 'نمای کلی' : 'Overview', icon: Home },
    { id: 'history' as TabType, label: t.navHistory, icon: History },
  ];
  const toolItems = [
    { id: 'image-gen' as TabType, label: t.navImage, icon: ImageIcon },
    { id: 'video-gen' as TabType, label: dari ? 'ابزارهای ویدیو' : 'Video tools', icon: Video },
    { id: 'tools' as TabType, label: t.navTools, icon: Wrench },
    { id: 'terminal' as TabType, label: dari ? 'ترمینل' : 'Terminal', icon: Terminal },
    { id: 'offline-chat' as TabType, label: dari ? 'حالت آفلاین' : 'Offline Mode', icon: BrainCircuit },
    { id: 'offline-learning' as TabType, label: dari ? 'آموزش آفلاین' : 'Offline learning', icon: BookOpen },
  ];

  const renderItem = (item: { id: TabType; label: string; icon: React.ElementType }) => {
    const Icon = item.icon;
    return (
      <button key={item.id} type="button" onClick={() => select(item.id)}
        aria-current={currentTab === item.id ? 'page' : undefined}
        className={itemClass(currentTab === item.id)}>
        <Icon aria-hidden="true" size={18} className={currentTab === item.id ? 'text-cyan-300' : 'text-slate-400 group-hover:text-cyan-200'} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {currentTab === item.id && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />}
      </button>
    );
  };

  return (
    <div className={'afg-drawer-root' + (isClosing ? ' is-closing' : '')} data-open={!isClosing}>
      <button type="button" aria-label={dari ? 'بستن منو' : 'Close navigation'}
        className="afg-drawer-backdrop" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={dari ? 'منوی پیمایش' : 'Navigation menu'}
        dir={dari ? 'rtl' : 'ltr'} className="afg-drawer-panel">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-5">
            <div className="flex items-center gap-3">
              <AfgBrainLogo size="sm" showBadge={false} />
              <div className="min-w-0">
                <div className="text-base font-extrabold tracking-tight text-white">{t.brandName}</div>
                <div className="text-[10px] font-medium tracking-[.16em] text-cyan-300/70">INTELLIGENCE, CONNECTED</div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label={dari ? 'بستن' : 'Close menu'}
              className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.10] to-indigo-500/[0.08] p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <UserRound size={19} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{dari ? user.name : user.nameEn}</div>
              <div className="truncate text-xs text-slate-400">{user.email || (dari ? 'حساب مهمان' : 'Guest account')}</div>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-cyan-200">
              {user.tier || (dari ? 'رایگان' : 'Free')}
            </span>
          </div>

          <div className="px-4 pt-5">
            <button type="button" onClick={() => { onNewChat(); onClose(); }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-[0_8px_28px_rgba(6,182,212,.18)] transition duration-200 hover:brightness-110 active:scale-[.98]">
              <Sparkles size={17} />{dari ? 'گفت‌وگوی جدید' : 'New chat'}
            </button>
          </div>

          <nav aria-label={dari ? 'پیمایش' : 'Navigation'} className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{dari ? 'اصلی' : 'Main'}</div>
            <div className="space-y-1">{mainItems.map(renderItem)}</div>

            <div className="mb-2 mt-6 flex items-center justify-between">
              <span className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{dari ? 'ابزارها' : 'Tools'}</span>
              <button type="button" onClick={() => setToolsExpanded(v => !v)}
                aria-expanded={toolsExpanded} aria-controls="afg-drawer-tools"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
                <ChevronDown size={16} className={`transition-transform duration-200 ${toolsExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div id="afg-drawer-tools" className={`grid transition-[grid-template-rows,opacity] duration-200 ${toolsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-1">{toolItems.map(renderItem)}
                  <button type="button" onClick={() => select('tools')} title={dari ? 'مرکز ابزارها و فایل‌ها' : 'Open tools and file workspace'}
                    className={itemClass(false)}>
                    <FolderOpen size={18} className="text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{dari ? 'فایل‌ها و اسناد' : 'Files & documents'}</span>
                    <span className="text-[9px] text-slate-500">{dari ? 'مرکز ابزارها' : 'Tools center'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{dari ? 'حساب' : 'Account'}</div>
            <div className="space-y-1">
              {renderItem({ id: 'settings', label: t.navSettings, icon: Settings })}
              {renderItem({ id: 'admin', label: t.navAdmin, icon: ShieldAlert })}
            </div>
          </nav>

          <div className="border-t border-white/[0.08] px-5 py-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>AFG AI</span><span>One AI. Many capabilities.</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
