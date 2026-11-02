import React from 'react';
import { MessageSquare, Wrench, User, History, Image as ImageIcon, Settings, FolderOpen, Terminal, BookOpen } from 'lucide-react';
import type { TabType, Language } from '../../types/afg';

interface AfgNavigationProps { currentTab: TabType; onChangeTab: (tab: TabType) => void; language: Language; }

export const AfgNavigation: React.FC<AfgNavigationProps> = ({ currentTab, onChangeTab, language }) => {
  const dari = language === 'dari';
  const items = [
    { key:'chat', id:'chat' as TabType, label:dari?'گفت‌وگو':'Chat', icon:MessageSquare },
    { key:'tools', id:'tools' as TabType, label:dari?'ابزارها':'Tools', icon:Wrench },
    { key:'image', id:'image-gen' as TabType, label:dari?'استودیوی تصویر':'Image Studio', icon:ImageIcon },
    { key:'files', id:'tools' as TabType, label:dari?'فایل‌ها':'Files', icon:FolderOpen },
    { key:'terminal', id:'terminal' as TabType, label:dari?'ترمینل':'Terminal', icon:Terminal },
    { key:'offline', id:'offline-learning' as TabType, label:dari?'آموزش آفلاین':'Offline Learning', icon:BookOpen },
    { key:'history', id:'history' as TabType, label:dari?'تاریخچه':'History', icon:History },
    { key:'settings', id:'settings' as TabType, label:dari?'تنظیمات':'Settings', icon:Settings },
    { key:'profile', id:'settings' as TabType, label:dari?'پروفایل':'Profile', icon:User },
  ];
  return <>
    <nav aria-label={dari?'پیمایش اصلی':'Primary navigation'} className="afg-primary-nav">
      <div className="afg-primary-nav-items">
        {items.map(item => {
          const Icon=item.icon;
          const active=currentTab===item.id && item.key!=='files' && item.key!=='profile';
          return <button key={item.key} type="button" onClick={()=>onChangeTab(item.id)} aria-current={active?'page':undefined} aria-label={item.label} title={item.key==='files'?(dari?'مرکز ابزارها؛ مدیریت فایل هنوز فعال نیست':'Tools center; file management is not enabled yet'):item.label} className={`afg-primary-nav-item ${active?'is-active':''}`}>
            <Icon aria-hidden="true" size={19}/><span>{item.label}</span>
          </button>;
        })}
      </div>
    </nav>
  </>;
};
