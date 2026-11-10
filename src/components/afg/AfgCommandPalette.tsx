import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, FolderOpen, Command, Github, ListChecks, Brain, Shield,
  Terminal, MonitorPlay, Undo2, Settings, History, Trash2, Download,
  X, ChevronRight, Check, Lock, Layers, MessageSquare, Plus, Sparkles,
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
  onOpenAfgAssistant: () => void;
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
    onClearChat, onFindInChat, onOpenAfgAssistant,
  } = props;
  const features = props.features || defaults;
  const locale=language==='dari'||language==='pashto'||language==='arabic'?language:'english';
  const dari=locale==='dari';
  const rtl=['dari','pashto','persian','arabic','urdu'].includes(language);
  const ps:Record<string,string>={
'Thinking level':'د فکر کچه','Permission level':'د اجازې کچه','Find in chat':'په خبرو کې لټون','Command runner':'د فرمان اجراکوونکی','Command palette':'د فرمانونو پالت','Minimal':'لږ تر لږه','Fast, direct responses':'چټک او مستقیم ځوابونه','Standard':'معیاري','Balanced speed and depth':'د سرعت او ژورتیا توازن','Deep':'ژور','More thorough analysis and checks':'ژوره شننه او بشپړ کتنه','Changes response instructions. Provider/model token caps remain provider-controlled.':'د ځواب لارښوونې بدلوي. د ټوکن حد د برابرونکي او ماډل له خوا ټاکل کېږي.','Ask before actions':'له کړنو مخکې پوښتنه','Request confirmation for consequential actions':'د مهمو کړنو لپاره تایید وغواړئ','Guided':'لارښوول شوی','Explain consequential steps':'مهم ګامونه تشریح کړئ','Full autonomy':'بشپړ خپلواکي','Only tools actually available and authorized':'یوازې شته او مجاز وسایل','This setting does not grant shell or operating-system access.':'دا امستنه د شیل یا عملیاتي سیسټم لاسرسی نه ورکوي.','Find text in this conversation...':'په دې خبرو کې متن ولټوئ...','Searches messages in the current conversation.':'د همدې خبرو پیغامونه لټوي.','Find':'موندل','Search current chat or type a command...':'اوسنۍ خبرې ولټوئ یا فرمان ولیکئ...','COMMANDS':'فرمانونه','QUICK OPEN':'چټک پرانیستل','Quick open':'چټک پرانیستل','Browse conversation history and saved work':'د خبرو تاریخچه او خوندي کارونه وګورئ','Search project':'پروژه ولټوئ','Search workspace and chat history':'کاري ځای او د خبرو تاریخچه ولټوئ','Run supported slash commands':'ملاتړ شوي / فرمانونه اجرا کړئ','TOOLS & MODES':'وسایل او حالتونه','Device assistant, voice commands and local AI':'د وسیلې مرستیال، غږیز فرمانونه او ځایي AI','Connected and health-verified':'وصل او د روغتیا له مخې تایید شوی','Not connected — open Connections in Settings':'وصل نه دی — په امستنو کې نښلونې پرانیزئ','Plan mode':'د پلان حالت','Enabled':'فعال','Plan before implementation':'له پلي کولو مخکې پلان جوړ کړئ','Dual planning':'دوه‌ګونی پلان','Not supported by this backend':'دا سرور یې نه ملاتړ کوي','Search text in this conversation':'په دې خبرو کې متن ولټوئ','Context & limits':'شالید او محدودیتونه','DEVELOPER TOOLS':'د پراختیا وسایل','Terminal':'ترمینل','Admin-enabled read-only terminal':'د مدیر له خوا فعال شوی یوازې-لوست ترمینل','Undo file changes':'د فایل بدلونونه بېرته ګرځول','No reversible AI file edits in this session':'په دې ناسته کې د AI د بېرته ګرځولو وړ بدلون نشته','History':'تاریخچه','Previous conversations':'پخوانۍ خبرې','Settings':'امستنې','Preferences and integrations':'غوره‌توبونه او نښلونې','Export chat':'خبرې صادرول','Download a Markdown transcript':'د خبرو Markdown فایل ښکته کړئ','Clear chat':'خبرې پاکول','Remove messages from this conversation':'د همدې خبرو پیغامونه لرې کړئ','Clear this conversation?':'دا خبرې پاکې شي؟','Navigation menu':'د تګ راتګ مینو','All app sections':'د اپ ټولې برخې'};
  const ar:Record<string,string>={
'Thinking level':'مستوى التفكير','Permission level':'مستوى الصلاحية','Find in chat':'البحث في المحادثة','Command runner':'منفّذ الأوامر','Command palette':'لوحة الأوامر','Minimal':'محدود','Fast, direct responses':'إجابات سريعة ومباشرة','Standard':'قياسي','Balanced speed and depth':'توازن بين السرعة والعمق','Deep':'عميق','More thorough analysis and checks':'تحليل وفحوصات أكثر شمولاً','Changes response instructions. Provider/model token caps remain provider-controlled.':'يغيّر تعليمات الرد. تظل حدود الرموز خاضعة للمزوّد والنموذج.','Ask before actions':'اسأل قبل التنفيذ','Request confirmation for consequential actions':'اطلب التأكيد للإجراءات المهمة','Guided':'موجّه','Explain consequential steps':'اشرح الخطوات المهمة','Full autonomy':'استقلالية كاملة','Only tools actually available and authorized':'الأدوات المتاحة والمصرح بها فقط','This setting does not grant shell or operating-system access.':'لا يمنح هذا الإعداد وصولاً إلى shell أو نظام التشغيل.','Find text in this conversation...':'ابحث عن نص في هذه المحادثة...','Searches messages in the current conversation.':'يبحث في رسائل المحادثة الحالية.','Find':'بحث','Search current chat or type a command...':'ابحث في المحادثة الحالية أو اكتب أمراً...','COMMANDS':'الأوامر','QUICK OPEN':'فتح سريع','Quick open':'فتح سريع','Browse conversation history and saved work':'تصفح سجل المحادثات والأعمال المحفوظة','Search project':'البحث في المشروع','Search workspace and chat history':'البحث في مساحة العمل وسجل المحادثات','Run supported slash commands':'تشغيل أوامر الشرطة المائلة المدعومة','TOOLS & MODES':'الأدوات والأوضاع','Device assistant, voice commands and local AI':'مساعد الجهاز والأوامر الصوتية والذكاء المحلي','Connected and health-verified':'متصل وتم التحقق من سلامته','Not connected — open Connections in Settings':'غير متصل — افتح الاتصالات في الإعدادات','Plan mode':'وضع التخطيط','Enabled':'مفعّل','Plan before implementation':'خطط قبل التنفيذ','Dual planning':'تخطيط مزدوج','Not supported by this backend':'هذه الواجهة الخلفية لا تدعم ذلك','Search text in this conversation':'ابحث في نص هذه المحادثة','Context & limits':'السياق والحدود','DEVELOPER TOOLS':'أدوات المطور','Terminal':'الطرفية','Admin-enabled read-only terminal':'طرفية للقراءة فقط مفعّلة من المسؤول','Undo file changes':'التراجع عن تغييرات الملفات','No reversible AI file edits in this session':'لا توجد تعديلات ملفات قابلة للتراجع في هذه الجلسة','History':'السجل','Previous conversations':'المحادثات السابقة','Settings':'الإعدادات','Preferences and integrations':'التفضيلات والتكاملات','Export chat':'تصدير المحادثة','Download a Markdown transcript':'تنزيل نسخة Markdown من المحادثة','Clear chat':'مسح المحادثة','Remove messages from this conversation':'إزالة رسائل هذه المحادثة','Clear this conversation?':'هل تريد مسح هذه المحادثة؟','Navigation menu':'قائمة التنقل','All app sections':'جميع أقسام التطبيق'};
  const paletteText=(d:string,e:string)=>locale==='dari'?d:locale==='pashto'?(ps[e]||e):locale==='arabic'?(ar[e]||e):e;
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
    ? (paletteText('سطح تفکر','Thinking level'))
    : submenu === 'permission'
      ? (paletteText('سطح دسترسی','Permission level'))
      : submenu === 'find'
        ? (paletteText('جستجو در گفتگو','Find in chat'))
        : submenu === 'commands'
          ? (paletteText('اجرای دستور','Command runner'))
          : (paletteText('منوی سریع','Command palette'));

  return (
    <div className="afg-command-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="afg-command-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="afg-command-heading">
          <div><span className="afg-command-kicker">AFG AI / QUICK OPEN</span><h2>{title}</h2></div>
          <button type="button" className="afg-command-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
        </header>

        {submenu === 'thinking' && (
          <div className="afg-command-submenu">
            {([
              ['minimal', paletteText('حداقل','Minimal'), paletteText('پاسخ‌های سریع و مستقیم','Fast, direct responses')],
              ['standard', paletteText('استاندارد','Standard'), paletteText('تعادل میان سرعت و دقت','Balanced speed and depth')],
              ['deep', paletteText('عمیق','Deep'), paletteText('بررسی دقیق‌تر و چندمرحله‌ای','More thorough analysis and checks')],
            ] as const).map(([value, label, detail]) => (
              <button key={value} type="button" className="afg-command-choice" onClick={() => { onThinkingLevel(value); onClose(); }}>
                <span><b>{label}</b><small>{detail}</small></span>{thinkingLevel === value && <Check size={18}/>}
              </button>
            ))}
            <p className="afg-command-note">{paletteText('سطح تفکر دستورالعمل پاسخ را تغییر می‌دهد؛ سقف توکن را ارائه‌دهنده و مدل تعیین می‌کند.','Changes response instructions. Provider/model token caps remain provider-controlled.')}</p>
          </div>
        )}

        {submenu === 'permission' && (
          <div className="afg-command-submenu">
            {([
              ['ask', paletteText('پرسش پیش از اقدام','Ask before actions'), paletteText('برای تغییرات مهم تأیید بگیر','Request confirmation for consequential actions')],
              ['guided', paletteText('هدایت‌شده','Guided'), paletteText('مراحل مهم را توضیح بده','Explain consequential steps')],
              ['full', paletteText('خودمختاری کامل','Full autonomy'), paletteText('فقط ابزارهای واقعاً مجاز','Only tools actually available and authorized')],
            ] as const).map(([value, label, detail]) => (
              <button key={value} type="button" className="afg-command-choice" onClick={() => { onPermissionLevel(value); onClose(); }}>
                <span><b>{label}</b><small>{detail}</small></span>{permissionLevel === value && <Check size={18}/>}
              </button>
            ))}
            <p className="afg-command-note">{paletteText('این گزینه دسترسی جدید به ترمینل یا سیستم‌عامل ایجاد نمی‌کند.','This setting does not grant shell or operating-system access.')}</p>
          </div>
        )}

        {submenu === 'find' && (
          <div className="afg-command-submenu">
            <label className="afg-command-search"><Search size={17}/><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { onFindInChat(query.trim()); onClose(); } }} placeholder={paletteText('عبارت مورد نظر...','Find text in this conversation...')} /></label>
            <p className="afg-command-note">{paletteText('جستجو در پیام‌های همین گفتگو انجام می‌شود.','Searches messages in the current conversation.')}</p>
            <button className="afg-command-primary" type="button" disabled={!query.trim()} onClick={() => { onFindInChat(query.trim()); onClose(); }}>{paletteText('جستجو','Find')}</button>
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
            <label className="afg-command-search"><Search size={17}/><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (query.startsWith('/')) runCommand(query); else if (query.trim()) { onFindInChat(query.trim()); onClose(); } } }} placeholder={paletteText('جستجو یا تایپ دستور...','Search current chat or type a command...')} /><kbd>ESC</kbd></label>
            {query.startsWith('/') ? (
              <div className="afg-command-group"><div className="afg-command-section">{paletteText('دستورات','COMMANDS')}</div>{['/new','/history','/settings','/find',...(features.terminal_exec_enabled?['/terminal']:[])].filter((item)=>item.includes(query.toLowerCase())).map((item)=><button key={item} className="afg-command-choice" onClick={()=>runCommand(item)}>{item}<ChevronRight size={16}/></button>)}</div>
            ) : (
              <>
                <div className="afg-command-group">
                  <div className="afg-command-section">{paletteText('دسترسی سریع','QUICK OPEN')}</div>
                  {action(<FolderOpen size={18}/>,paletteText('باز کردن فضای کاری','Quick open'),paletteText('مرور گفتگوها و فایل‌های ذخیره‌شده','Browse conversation history and saved work'),()=>{onOpenHistory();onClose();})}
                  {action(<Search size={18}/>,paletteText('جستجوی پروژه','Search project'),paletteText('جستجو در تاریخچه پروژه','Search workspace and chat history'),()=>{onOpenHistory();onClose();})}
                  {action(<Command size={18}/>,paletteText('پالت دستورات','Command runner'),paletteText('اجرای دستورات سریع با /','Run supported slash commands'),()=>{setQuery('');setSubmenu('commands');})}
                </div>
                <div className="afg-command-group">
                  <div className="afg-command-section">{paletteText('ابزارها و حالت‌ها','TOOLS & MODES')}</div>
                  {action(<Sparkles size={18}/>, 'AFG AI', paletteText('دستیار دستگاه، فرمان صوتی و مدل محلی','Device assistant, voice commands and local AI'), () => { onOpenAfgAssistant(); onClose(); })}
                  {action(<Github size={18}/>,'GitHub',features.github_connected?(paletteText('متصل و تأییدشده','Connected and health-verified')):(paletteText('برای اتصال، تنظیمات را باز کنید','Not connected — open Connections in Settings')),()=>{onOpenSettings();onClose();},features.github_connected?<Check size={17}/>:<ChevronRight size={16}/>)}
                  {action(<ListChecks size={18}/>,paletteText('حالت برنامه‌ریزی','Plan mode'),planMode?(paletteText('فعال','Enabled')):(paletteText('ابتدا طرح مرحله‌ای','Plan before implementation')),()=>onPlanMode(!planMode),planMode?<Check size={17}/>:<span className="afg-command-switch"/> )}
                  {action(<Layers size={18}/>,paletteText('برنامه‌ریزی دوگانه','Dual planning'),features.dual_planning_enabled?(dualPlanning?'Enabled':'Available'):(paletteText('پشتیبانی سرور فعال نیست','Not supported by this backend')),()=>onDualPlanning(!dualPlanning),features.dual_planning_enabled?<Check size={17}/>:<Lock size={15}/>,!features.dual_planning_enabled)}
                  {action(<Brain size={18}/>,paletteText('سطح تفکر','Thinking level'),thinkingLevel.toUpperCase(),()=>{setQuery('');setSubmenu('thinking');})}
                  {action(<Shield size={18}/>,paletteText('سطح دسترسی','Permission level'),permissionLevel.toUpperCase(),()=>{setQuery('');setSubmenu('permission');})}
                  {action(<Search size={18}/>,paletteText('جستجو در گفتگو','Find in chat'),paletteText('جستجوی متن همین گفتگو','Search text in this conversation'),()=>{setQuery('');setSubmenu('find');})}
                  <div className="afg-command-action" aria-live="polite"><span className="afg-command-icon"><MessageSquare size={18}/></span><span className="afg-command-label"><b>{paletteText('زمینه و محدودیت‌ها','Context & limits')}</b><small>{contextWindow>0?`${tokenCount.toLocaleString()} / ${contextWindow.toLocaleString()} tokens · ${contextPercent}%`:`${tokenCount.toLocaleString()} estimated tokens · model limit unavailable`}</small></span><span className="afg-command-meter"><i style={{width:contextPercent+'%'}}/></span></div>
                </div>
                <div className="afg-command-group">
                  <div className="afg-command-section">{paletteText('ابزارهای توسعه','DEVELOPER TOOLS')}</div>
                  {features.terminal_exec_enabled && action(<Terminal size={18}/>,paletteText('ترمینل','Terminal'),paletteText('ترمینل فقط‌خواندنی فعال‌شده توسط مدیر','Admin-enabled read-only terminal'),()=>{onOpenTerminal();onClose();})}
                  {action(<Undo2 size={18}/>,paletteText('بازگردانی تغییرات فایل','Undo file changes'),features.undo_file_changes_enabled?'Restore last AI file edit':(paletteText('در این گفتگو تغییری در فایل ثبت نشده','No reversible AI file edits in this session')),()=>{},<Lock size={15}/>,!features.undo_file_changes_enabled)}
                </div>
                <div className="afg-command-group afg-command-bottom">
                  {action(<History size={18}/>,paletteText('تاریخچه','History'),paletteText('گفتگوهای قبلی','Previous conversations'),()=>{onOpenHistory();onClose();})}
                  {action(<Settings size={18}/>,paletteText('تنظیمات','Settings'),paletteText('تنظیمات و اتصال‌ها','Preferences and integrations'),()=>{onOpenSettings();onClose();})}
                  {action(<Download size={18}/>,paletteText('خروجی گفتگو','Export chat'),paletteText('دانلود فایل Markdown','Download a Markdown transcript'),exportChat)}
                  {action(<Trash2 size={18}/>,paletteText('پاک کردن گفتگو','Clear chat'),paletteText('حذف پیام‌های همین گفتگو','Remove messages from this conversation'),()=>{if(window.confirm(paletteText('گفتگو پاک شود؟','Clear this conversation?'))){onClearChat();onClose();}})}
                  {action(<Plus size={18}/>,paletteText('منوی ناوبری','Navigation menu'),paletteText('همه بخش‌های برنامه','All app sections'),()=>{onOpenNavigation();onClose();})}
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
