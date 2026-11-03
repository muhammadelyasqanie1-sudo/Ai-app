import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, FolderOpen, Command, Github, ListChecks, Brain, Shield,
  Terminal, MonitorPlay, Undo2, Settings, History, Trash2, Download,
  X, ChevronRight, Check, Lock, Layers, MessageSquare, Plus,
} from 'lucide-react';
import type { AfgMessage, Language } from '../../types/afg';
import './AfgCommandPalette.css';

export interface AfgSystemFeatures {
  voice_stt_enabled: boolean;
  terminal_exec_enabled: boolean;
  github_connected: boolean;
  web_preview_enabled: boolean;
  file_upload_enabled: boolean;
  dual_planning_enabled: boolean;
  undo_file_changes_enabled: boolean;
}

interface AfgCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  messages: AfgMessage[];
  modelName: string;
  contextWindow: number;
  thinkingLevel: 'minimal' | 'standard' | 'deep';
  onThinkingLevel: (value: 'minimal' | 'standard' | 'deep') => void;
  planMode: boolean;
  onPlanMode: (value: boolean) => void;
  dualPlanning: boolean;
  onDualPlanning: (value: boolean) => void;
  permissionLevel: 'ask' | 'guided' | 'full';
  onPermissionLevel: (value: 'ask' | 'guided' | 'full') => void;
  features: AfgSystemFeatures;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenNavigation: () => void;
  onOpenTerminal: () => void;
  onClearChat: () => void;
  onFindInChat: (query: string) => void;
}

const defaults: AfgSystemFeatures = {
  voice_stt_enabled: false, terminal_exec_enabled: false, github_connected: false,
  web_preview_enabled: false, file_upload_enabled: false,
  dual_planning_enabled: false, undo_file_changes_enabled: false,
};

export const AfgCommandPalette: React.FC<AfgCommandPaletteProps> = (props) => {
  const {
    open, onClose, language, messages, modelName, contextWindow,
    thinkingLevel, onThinkingLevel, planMode, onPlanMode,
    dualPlanning, onDualPlanning, permissionLevel, onPermissionLevel,
    onOpenHistory, onOpenSettings, onOpenNavigation, onOpenTerminal,
    onClearChat, onFindInChat,
  } = props;
  const features = props.features || defaults;
  const dari = language === 'dari';
  const [query, setQuery] = useState('');
  const [submenu, setSubmenu] = useState<'thinking' | 'permission' | 'find' | 'commands' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenCount = useMemo(() => Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4), [messages]);
  const contextPercent = contextWindow > 0 ? Math.min(100, Math.round(tokenCount / contextWindow * 100)) : 0;

  useEffect(() => {
    if (!open) { setQuery(''); setSubmenu(null); return; }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, submenu]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);

  if (!open) return null;

  const runCommand = (value: string) => {
    const command = value.trim().toLowerCase();
    if (command === '/new' || command === '/clear') { onClearChat(); onClose(); return; }
    if (command === '/settings') { onOpenSettings(); onClose(); return; }
    if (command === '/history') { onOpenHistory(); onClose(); return; }
    if (command === '/terminal' && features.terminal_exec_enabled) { onOpenTerminal(); onClose(); return; }
    if (command === '/find') { setSubmenu('find'); setQuery(''); return; }
    setSubmenu(null);
  };

  const exportChat = () => {
    const transcript = messages.map((message) => {
      const role = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AFG AI' : 'System';
      return `## ${role}\n\n${message.content}`;
    }).join('\n\n---\n\n');
    const blob = new Blob([`# AFG AI conversation\n\n${transcript}\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'afg-ai-chat.md';
    anchor.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const action = (icon: React.ReactNode, title: string, detail: string, onClick: () => void, right?: React.ReactNode, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className="afg-command-action" aria-disabled={disabled}>
      <span className="afg-command-icon">{icon}</span>
      <span className="afg-command-label"><b>{title}</b><small>{detail}</small></span>
      <span className="afg-command-right">{right || <ChevronRight size={16} />}</span>
    </button>
  );

  const title = submenu === 'thinking'
    ? (dari ? 'سطح تفکر' : 'Thinking level')
    : submenu === 'permission'
      ? (dari ? 'سطح دسترسی' : 'Permission level')
      : submenu === 'find'
        ? (dari ? 'جستجو در گفتگو' : 'Find in chat')
        : submenu === 'commands'
          ? (dari ? 'اجرای دستور' : 'Command runner')
          : (dari ? 'منوی سریع' : 'Command palette');

  return (
    <div className="afg-command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="afg-command-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="afg-command-heading">
          <div><span className="afg-command-kicker">AFG AI / QUICK OPEN</span><h2>{title}</h2></div>
          <button type="button" className="afg-command-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
        </header>

        {submenu === 'thinking' && (
          <div className="afg-command-submenu">
            {([
              ['minimal', dari ? 'حداقل' : 'Minimal', dari ? 'پاسخ‌های سریع و مستقیم' : 'Fast, direct responses'],
              ['standard', dari ? 'استاندارد' : 'Standard', dari ? 'تعادل میان سرعت و دقت' : 'Balanced speed and depth'],
              ['deep', dari ? 'عمیق' : 'Deep', dari ? 'بررسی دقیق‌تر و چندمرحله‌ای' : 'More thorough analysis and checks'],
            ] as const).map(([value, label, detail]) => (
              <button key={value} type="button" className="afg-command-choice" onClick={() => { onThinkingLevel(value); onClose(); }}>
                <span><b>{label}</b><small>{detail}</small></span>{thinkingLevel === value && <Check size={18}/>}
              </button>
            ))}
            <p className="afg-command-note">{dari ? 'سطح تفکر دستورالعمل پاسخ را تغییر می‌دهد؛ سقف توکن را ارائه‌دهنده و مدل تعیین می‌کند.' : 'Changes response instructions. Provider/model token caps remain provider-controlled.'}</p>
          </div>
        )}

        {submenu === 'permission' && (
          <div className="afg-command-submenu">
            {([
              ['ask', dari ? 'پرسش پیش از اقدام' : 'Ask before actions', dari ? 'برای تغییرات مهم تأیید بگیر' : 'Request confirmation for consequential actions'],
              ['guided', dari ? 'هدایت‌شده' : 'Guided', dari ? 'مراحل مهم را توضیح بده' : 'Explain consequential steps'],
              ['full', dari ? 'خودمختاری کامل' : 'Full autonomy', dari ? 'فقط ابزارهای واقعاً مجاز' : 'Only tools actually available and authorized'],
            ] as const).map(([value, label, detail]) => (
              <button key={value} type="button" className="afg-command-choice" onClick={() => { onPermissionLevel(value); onClose(); }}>
                <span><b>{label}</b><small>{detail}</small></span>{permissionLevel === value && <Check size={18}/>}
              </button>
            ))}
            <p className="afg-command-note">{dari ? 'این گزینه دسترسی جدید به ترمینل یا سیستم‌عامل ایجاد نمی‌کند.' : 'This setting does not grant shell or operating-system access.'}</p>
          </div>
        )}

        {submenu === 'find' && (
          <div className="afg-command-submenu">
            <label className="afg-command-search"><Search size={17}/><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { onFindInChat(query.trim()); onClose(); } }} placeholder={dari ? 'عبارت مورد نظر...' : 'Find text in this conversation...'} /></label>
            <p className="afg-command-note">{dari ? 'جستجو در پیام‌های همین گفتگو انجام می‌شود.' : 'Searches messages in the current conversation.'}</p>
            <button className="afg-command-primary" type="button" disabled={!query.trim()} onClick={() => { onFindInChat(query.trim()); onClose(); }}>{dari ? 'جستجو' : 'Find'}</button>
          </div>
        )}

        {submenu === 'commands' && (
          <div className="afg-command-submenu">
            <label className="afg-command-search"><Command size={17}/><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runCommand(query); }} placeholder="/new, /history, /settings..." /></label>
            {['/new','/history','/settings','/find',...(features.terminal_exec_enabled ? ['/terminal'] : [])].filter((item) => !query || item.includes(query.toLowerCase())).map((item) => <button key={item} type="button" className="afg-command-choice" onClick={() => runCommand(item)}><b>{item}</b><ChevronRight size={16}/></button>)}
          </div>
        )}

        {!submenu && (
          <>
            <label className="afg-command-search"><Search size={17}/><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (query.startsWith('/')) runCommand(query); else if (query.trim()) { onFindInChat(query.trim()); onClose(); } } }} placeholder={dari ? 'جستجو یا تایپ دستور...' : 'Search current chat or type a command...'} /><kbd>ESC</kbd></label>
            {query.startsWith('/') ? (
              <div className="afg-command-group"><div className="afg-command-section">{dari ? 'دستورات' : 'COMMANDS'}</div>{['/new','/history','/settings','/find',...(features.terminal_exec_enabled?['/terminal']:[])].filter((item)=>item.includes(query.toLowerCase())).map((item)=><button key={item} className="afg-command-choice" onClick={()=>runCommand(item)}>{item}<ChevronRight size={16}/></button>)}</div>
            ) : (
              <>
                <div className="afg-command-group">
                  <div className="afg-command-section">{dari ? 'دسترسی سریع' : 'QUICK OPEN'}</div>
                  {action(<FolderOpen size={18}/>,dari?'باز کردن فضای کاری':'Quick open',dari?'مرور گفتگوها و فایل‌های ذخیره‌شده':'Browse conversation history and saved work',()=>{onOpenHistory();onClose();})}
                  {action(<Search size={18}/>,dari?'جستجوی پروژه':'Search project',dari?'جستجو در تاریخچه پروژه':'Search workspace and chat history',()=>{onOpenHistory();onClose();})}
                  {action(<Command size={18}/>,dari?'پالت دستورات':'Command runner',dari?'اجرای دستورات سریع با /':'Run supported slash commands',()=>{setQuery('');setSubmenu('commands');})}
                </div>
                <div className="afg-command-group">
                  <div className="afg-command-section">{dari?'ابزارها و حالت‌ها':'TOOLS & MODES'}</div>
                  {action(<Github size={18}/>,'GitHub',features.github_connected?(dari?'متصل و تأییدشده':'Connected and health-verified'):(dari?'برای اتصال، تنظیمات را باز کنید':'Not connected — open Connections in Settings'),()=>{onOpenSettings();onClose();},features.github_connected?<Check size={17}/>:<ChevronRight size={16}/>)}
                  {action(<ListChecks size={18}/>,dari?'حالت برنامه‌ریزی':'Plan mode',planMode?(dari?'فعال':'Enabled'):(dari?'ابتدا طرح مرحله‌ای':'Plan before implementation'),()=>onPlanMode(!planMode),planMode?<Check size={17}/>:<span className="afg-command-switch"/> )}
                  {action(<Layers size={18}/>,dari?'برنامه‌ریزی دوگانه':'Dual planning',features.dual_planning_enabled?(dualPlanning?'Enabled':'Available'):(dari?'پشتیبانی سرور فعال نیست':'Not supported by this backend'),()=>onDualPlanning(!dualPlanning),features.dual_planning_enabled?<Check size={17}/>:<Lock size={15}/>,!features.dual_planning_enabled)}
                  {action(<Brain size={18}/>,dari?'سطح تفکر':'Thinking level',thinkingLevel.toUpperCase(),()=>{setQuery('');setSubmenu('thinking');})}
                  {action(<Shield size={18}/>,dari?'سطح دسترسی':'Permission level',permissionLevel.toUpperCase(),()=>{setQuery('');setSubmenu('permission');})}
                  {action(<Search size={18}/>,dari?'جستجو در گفتگو':'Find in chat',dari?'جستجوی متن همین گفتگو':'Search text in this conversation',()=>{setQuery('');setSubmenu('find');})}
                  <div className="afg-command-action" aria-live="polite"><span className="afg-command-icon"><MessageSquare size={18}/></span><span className="afg-command-label"><b>{dari?'زمینه و محدودیت‌ها':'Context & limits'}</b><small>{contextWindow>0?`${tokenCount.toLocaleString()} / ${contextWindow.toLocaleString()} tokens · ${contextPercent}%`:`${tokenCount.toLocaleString()} estimated tokens · model limit unavailable`}</small></span><span className="afg-command-meter"><i style={{width:contextPercent+'%'}}/></span></div>
                </div>
                <div className="afg-command-group">
                  <div className="afg-command-section">{dari?'ابزارهای توسعه':'DEVELOPER TOOLS'}</div>
                  {features.terminal_exec_enabled && action(<Terminal size={18}/>,dari?'ترمینل':'Terminal',dari?'ترمینل فقط‌خواندنی فعال‌شده توسط مدیر':'Admin-enabled read-only terminal',()=>{onOpenTerminal();onClose();})}
                  {features.web_preview_enabled && action(<MonitorPlay size={18}/>,'Web preview','Active local preview session',()=>{})}
                  {action(<Undo2 size={18}/>,dari?'بازگردانی تغییرات فایل':'Undo file changes',features.undo_file_changes_enabled?'Restore last AI file edit':(dari?'در این گفتگو تغییری در فایل ثبت نشده':'No reversible AI file edits in this session'),()=>{},<Lock size={15}/>,!features.undo_file_changes_enabled)}
                </div>
                <div className="afg-command-group afg-command-bottom">
                  {action(<History size={18}/>,dari?'تاریخچه':'History',dari?'گفتگوهای قبلی':'Previous conversations',()=>{onOpenHistory();onClose();})}
                  {action(<Settings size={18}/>,dari?'تنظیمات':'Settings',dari?'تنظیمات و اتصال‌ها':'Preferences and integrations',()=>{onOpenSettings();onClose();})}
                  {action(<Download size={18}/>,dari?'خروجی گفتگو':'Export chat',dari?'دانلود فایل Markdown':'Download a Markdown transcript',exportChat)}
                  {action(<Trash2 size={18}/>,dari?'پاک کردن گفتگو':'Clear chat',dari?'حذف پیام‌های همین گفتگو':'Remove messages from this conversation',()=>{if(window.confirm(dari?'گفتگو پاک شود؟':'Clear this conversation?')){onClearChat();onClose();}})}
                  {action(<Plus size={18}/>,dari?'منوی ناوبری':'Navigation menu',dari?'همه بخش‌های برنامه':'All app sections',()=>{onOpenNavigation();onClose();})}
                </div>
              </>
            )}
          </>
        )}
        <footer className="afg-command-footer"><span>{modelName}</span><span>CTRL / ⌘ + K</span></footer>
      </section>
    </div>
  );
};
