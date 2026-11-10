import React from 'react';
import { MessageSquare, Wrench, User, History, Image as ImageIcon, Settings, FolderOpen, Terminal, BookOpen } from 'lucide-react';
import type { TabType, Language } from '../../types/afg';

interface AfgNavigationProps { currentTab: TabType; onChangeTab: (tab: TabType) => void; language: Language; }

export const AfgNavigation: React.FC<AfgNavigationProps> = ({ currentTab, onChangeTab, language }) => {
  const rtl = ['dari','pashto','persian','arabic','urdu'].includes(language);
  const labels = {
    dari:['گفت‌وگو','ابزارها','استودیوی تصویر','فایل‌ها','ترمینل','آموزش آفلاین','تاریخچه','تنظیمات','پروفایل','پیمایش اصلی','مرکز ابزارها؛ مدیریت فایل هنوز فعال نیست'],
    english:['Chat','Tools','Image Studio','Files','Terminal','Offline Learning','History','Settings','Profile','Primary navigation','Tools center; file management is not enabled yet'],
    pashto:['خبرې','وسایل','د انځور سټوډیو','فایلونه','ټرمینل','نالیکي زده‌کړه','تاریخچه','امستنې','پروفایل','اصلي لارښود','د وسایلو مرکز؛ د فایلونو سمبالښت لا فعال نه دی'],
    arabic:['المحادثة','الأدوات','استوديو الصور','الملفات','الطرفية','التعلّم دون اتصال','السجل','الإعدادات','الملف الشخصي','التنقّل الرئيسي','مركز الأدوات؛ إدارة الملفات غير مفعّلة بعد']
  }[language === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english'];
  const items = [
    { key:'chat', id:'chat' as TabType, label:labels[0], icon:MessageSquare },
    { key:'tools', id:'tools' as TabType, label:labels[1], icon:Wrench },
    { key:'image', id:'image-gen' as TabType, label:labels[2], icon:ImageIcon },
    { key:'files', id:'tools' as TabType, label:labels[3], icon:FolderOpen },
    { key:'terminal', id:'terminal' as TabType, label:labels[4], icon:Terminal },
    { key:'offline', id:'offline-learning' as TabType, label:labels[5], icon:BookOpen },
    { key:'history', id:'history' as TabType, label:labels[6], icon:History },
    { key:'settings', id:'settings' as TabType, label:labels[7], icon:Settings },
    { key:'profile', id:'settings' as TabType, label:labels[8], icon:User },
  ];
  return <>
    <nav aria-label={labels[9]} className="afg-primary-nav" dir={rtl?'rtl':'ltr'}>
      <div className="afg-primary-nav-items">
        {items.map(item => {
          const Icon=item.icon;
          const active=currentTab===item.id && item.key!=='files' && item.key!=='profile';
          return <button key={item.key} type="button" onClick={()=>onChangeTab(item.id)} aria-current={active?'page':undefined} aria-label={item.label} title={item.key==='files'?labels[10]:item.label} className={`afg-primary-nav-item ${active?'is-active':''}`}>
            <Icon aria-hidden="true" size={19}/><span>{item.label}</span>
          </button>;
        })}
      </div>
    </nav>
  </>;
};
