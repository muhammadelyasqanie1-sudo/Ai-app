import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronRight, ArrowLeft, Globe, Palette, MessageSquare, Brain, Code2, Shield,
  Cpu, Smartphone, Mic, FileText, Github, Send, Server, Network, KeyRound, Router, Settings2,
  CheckCircle2, AlertCircle, LockKeyhole, ExternalLink
} from 'lucide-react';
import type { Language, Theme, UserProfile } from '../../types/afg';
import { AfgAccountSettings } from './AfgAccountSettings';
import { AfgAdminPanel } from './AfgAdminPanel';
import { AfgFileLibrary } from './AfgFileLibrary';
import { getHubUi } from '../../utils/localeUi';

type Context = 'user' | 'admin';
type SettingId = 'language'|'appearance'|'chat'|'memory'|'coding'|'privacy'|'files'|'models'|'local'|'voice'|'github'|'telegram'|'ftp'|'mcp'|'byok'|'router';
type Item = { id: SettingId; group: string; title: string; subtitle: string; icon: React.ElementType; keywords: string[] };
type Status = 'active'|'ready'|'setup'|'disabled'|'unknown';

const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const csrf = () => decodeURIComponent(document.cookie.split('; ').find(v => v.startsWith('afg_csrf='))?.slice(9) || '');
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrf());
  const response = await fetch(API + path, { ...init, headers, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const ITEMS: Item[] = [
  {id:'language',group:'Personalize',title:'App language',subtitle:'Choose the language used across AFG AI.',icon:Globe,keywords:['locale','dari','english','persian','pashto','arabic','urdu','turkish','russian','french','spanish','german','chinese','hindi','bengali','indonesian','portuguese','japanese','korean','ترجمه']},
  {id:'appearance',group:'Personalize',title:'Appearance',subtitle:'Theme, accent color, density and typography.',icon:Palette,keywords:['light','dark','system','neon','color']},
  {id:'chat',group:'Personalize',title:'Chat settings',subtitle:'Response preferences, chat width and startup behavior.',icon:MessageSquare,keywords:['instructions','prompt','images','startup']},
  {id:'memory',group:'Personalize',title:'Memory',subtitle:'Review and manage saved memory items.',icon:Brain,keywords:['remember','saved memory']},
  {id:'coding',group:'Personalize',title:'Coding',subtitle:'Coding workspace and execution preferences.',icon:Code2,keywords:['agent','terminal','programming','sandbox']},
  {id:'privacy',group:'Personalize',title:'Privacy & security',subtitle:'Account security, sessions and personal data.',icon:Shield,keywords:['lock','biometric','screenshots','delete account']},
  {id:'files',group:'Your Assistant',title:'Files & workspace',subtitle:'Private file library, upload and quarantine status.',icon:FileText,keywords:['upload','pdf','documents','workspace','storage']},
  {id:'models',group:'Your Assistant',title:'Models & providers',subtitle:'Verified models, default selection and availability.',icon:Cpu,keywords:['ai','model','provider','fallback']},
  {id:'local',group:'Your Assistant',title:'Local models',subtitle:'On-device models and offline mode availability.',icon:Smartphone,keywords:['offline','ollama','webllm','download']},
  {id:'voice',group:'Your Assistant',title:'Voice & speech',subtitle:'Speech recognition and text-to-speech capabilities.',icon:Mic,keywords:['microphone','tts','stt']},
  {id:'github',group:'Connections',title:'GitHub',subtitle:'Link your account to import repositories and publish changes.',icon:Github,keywords:['oauth','repository','git']},
  {id:'telegram',group:'Connections',title:'Telegram',subtitle:'Pair your account with the AFG AI Telegram bot.',icon:Send,keywords:['bot','pairing']},
  {id:'ftp',group:'Connections',title:'FTP / SFTP sync',subtitle:'Connect a remote workspace for file transfer.',icon:Server,keywords:['sftp','ftp','upload','download']},
  {id:'mcp',group:'Connections',title:'Connected tools (MCP)',subtitle:'Tools exposed by a supported desktop runtime.',icon:Network,keywords:['mcp','tools','servers']},
  {id:'byok',group:'Special Providers',title:'Connected accounts (BYOK)',subtitle:'Use your own provider credentials when enabled.',icon:KeyRound,keywords:['openai','anthropic','claude','deepseek','api key']},
  {id:'router',group:'Special Providers',title:'9Router / local router',subtitle:'Connect a local OpenAI-compatible model router.',icon:Router,keywords:['litellm','ollama','localhost','proxy']},
];

const copy = {
  en: {
    search:'Search settings', user:'User settings', admin:'Admin settings', back:'Back to settings',
    configured:'Connected', available:'Available', setup:'Requires setup', disabled:'Disabled by administrator', checking:'Checking status…',
    save:'Save', notConfigured:'Not configured', signIn:'Sign in to configure personal settings.',
    disabledText:'This feature is disabled by the platform administrator.',
    setupText:'The backend has not confirmed this integration as active. Ask an administrator to finish setup.',
    noResults:'No settings match your search.',
    groups:['Personalize','Your Assistant','Connections','Special Providers'],
    githubConnect:'Connect GitHub account', githubDisconnect:'Disconnect GitHub',
    githubReady:'GitHub OAuth is configured by the platform. Connect your personal account to continue.',
    openAccount:'Account and preference controls', adminIntro:'Global configuration and infrastructure controls are protected by administrator role checks.',
    models:'Verified models', noModels:'No health-verified models are currently available.',
    defaultModel:'Default model', modelSaved:'Default model saved.',
    local:'Offline model runtime', voice:'Voice capabilities', feature:'Feature availability',
    notAvailable:'Not available until the backend reports it as enabled.',
    statusError:'Could not verify backend status. Treat this feature as unavailable.',
    language:'Language preference', languageHelp:'18 language and regional locales are selectable. Full interface translations are being rolled out; unreviewed languages currently fall back to English UI text.',
    adminGate:'Admin access is verified by the server; this view does not grant admin privileges.',
  },
  fa: {
    search:'جستجوی تنظیمات', user:'تنظیمات کاربر', admin:'تنظیمات مدیر', back:'بازگشت به تنظیمات',
    configured:'متصل', available:'فعال', setup:'نیازمند راه‌اندازی', disabled:'توسط مدیر غیرفعال شده', checking:'در حال بررسی وضعیت…',
    save:'ذخیره', notConfigured:'تنظیم نشده', signIn:'برای ذخیره تنظیمات شخصی وارد حساب شوید.',
    disabledText:'این قابلیت توسط مدیر پلتفرم غیرفعال شده است.',
    setupText:'فعال بودن این اتصال هنوز از سوی سرور تأیید نشده است. مدیر باید راه‌اندازی را تکمیل کند.',
    noResults:'تنظیمی با این جستجو پیدا نشد.',
    groups:['شخصی‌سازی','دستیار هوشمند','اتصال‌ها','ارائه‌دهندگان ویژه'],
    githubConnect:'اتصال حساب GitHub', githubDisconnect:'قطع اتصال GitHub',
    githubReady:'OAuth گیت‌هاب توسط پلتفرم تنظیم شده است. حساب شخصی خود را متصل کنید.',
    openAccount:'کنترل‌های حساب و ترجیحات', adminIntro:'تنظیمات سراسری و زیرساخت فقط با نقش مدیر قابل دسترسی است.',
    models:'مدل‌های تأییدشده', noModels:'اکنون هیچ مدل تأییدشده و سالمی موجود نیست.',
    defaultModel:'مدل پیش‌فرض', modelSaved:'مدل پیش‌فرض ذخیره شد.',
    local:'اجرای مدل آفلاین', voice:'قابلیت‌های صوتی', feature:'دسترسی قابلیت',
    notAvailable:'تا زمانی که سرور فعال بودن آن را تأیید نکند، در دسترس نیست.',
    statusError:'بررسی وضعیت سرور ناموفق بود؛ این قابلیت غیرفعال فرض می‌شود.',
    language:'ترجیحات زبان', languageHelp:'۱۸ زبان و منطقه قابل انتخاب است. ترجمه کامل رابط کاربری به‌تدریج تکمیل می‌شود و زبان‌های ترجمه‌نشده فعلاً متن انگلیسی نمایش می‌دهند.',
    adminGate:'دسترسی مدیر توسط سرور بررسی می‌شود؛ این صفحه امتیاز مدیر ایجاد نمی‌کند.',
  }
};

const LANGUAGE_OPTIONS: Array<{id:Language;label:string;native:string}> = [
  {id:'english',label:'English',native:'English'},{id:'dari',label:'Dari',native:'دری'},
  {id:'pashto',label:'Pashto',native:'پښتو'},{id:'persian',label:'Persian',native:'فارسی'},
  {id:'arabic',label:'Arabic',native:'العربية'},{id:'urdu',label:'Urdu',native:'اردو'},
  {id:'turkish',label:'Turkish',native:'Türkçe'},{id:'russian',label:'Russian',native:'Русский'},
  {id:'french',label:'French',native:'Français'},{id:'spanish',label:'Spanish',native:'Español'},
  {id:'german',label:'German',native:'Deutsch'},{id:'chinese',label:'Chinese (Simplified)',native:'简体中文'},
  {id:'hindi',label:'Hindi',native:'हिन्दी'},{id:'bengali',label:'Bengali',native:'বাংলা'},
  {id:'indonesian',label:'Indonesian',native:'Bahasa Indonesia'},{id:'portuguese',label:'Portuguese',native:'Português'},
  {id:'japanese',label:'Japanese',native:'日本語'},{id:'korean',label:'Korean',native:'한국어'},
];

interface Props {
  language: Language; theme: Theme; user: UserProfile;
  onSetLanguage: (language: Language) => void; onToggleTheme: () => void;
  onSetTheme: (theme: Theme) => void; onOpenShortcuts: () => void;
}

export const AfgSettingsHub: React.FC<Props> = ({language,theme,user,onSetLanguage,onSetTheme,onOpenShortcuts}) => {
  const fa = language === 'dari';
  const hubUi = getHubUi(language);
  const t = { ...copy.en, ...(fa ? copy.fa : {}), ...hubUi };
  const groupLabels = (hubUi.groups || '').split(' · ');
  const [context,setContext] = useState<Context>('user');
  const [query,setQuery] = useState('');
  const [page,setPage] = useState<SettingId|null>(null);
  const [status,setStatus] = useState<Record<string,Status>>({});
  const [statusLoading,setStatusLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [authenticated,setAuthenticated] = useState(false);
  const [github,setGithub] = useState({configured:false,linked:false,username:''});
  const [featureFlags,setFeatureFlags] = useState<Record<string,boolean>>({});
  const [models,setModels] = useState<Array<{id:string;providerId?:string;displayName?:string;selectable?:boolean}>>([]);
  const [selectedModel,setSelectedModel] = useState('');
  const [adminAllowed,setAdminAllowed] = useState(false);

  const refreshStatus = async () => {
    setStatusLoading(true); setError('');
    const next: Record<string,Status> = {};
    try {
      const [me,cap,gh,featureData] = await Promise.all([
        request('/api/auth/me').catch(()=>({authenticated:false})),
        request('/api/capabilities').catch(()=>({verified:false,capabilities:{}})),
        request('/api/integrations/github/status').catch(()=>({configured:false,linked:false})),
        request('/api/features/status').catch(()=>({verified:false,featureFlags:{},integrations:{}})),
      ]);
      setAuthenticated(me.authenticated===true);
      setAdminAllowed(me.authenticated===true && me.user?.role==='admin');
      setGithub({configured:gh.configured===true || featureData.githubOAuthConfigured===true,linked:gh.linked===true,username:gh.username||''});
      const flagMap:Record<string,boolean> = featureData.verified===true ? (featureData.featureFlags||{}) : {};
      const integrations:Record<string,any> = featureData.verified===true ? (featureData.integrations||{}) : {};
      setFeatureFlags(flagMap);
      const caps=cap.capabilities||{};
      next.models=cap.verified===true?'ready':'setup';
      const localFlag = flagMap.local_models ?? flagMap.offline_models ?? flagMap.offline_learning;
      next.local=localFlag===false?'disabled':localFlag===true?'setup':'unknown';
      next.voice=flagMap.voice===false?'disabled':flagMap.voice===true && (caps['speech-to-text']||caps['text-to-speech'])?'ready':(caps['speech-to-text']||caps['text-to-speech'])?'ready':'setup';
      next.github=gh.linked===true?'active':gh.configured===true?'ready':'setup';
      const integrationStatus=(slug:string):Status => integrations[slug]?.active===true?'ready':integrations[slug]?.status==='disabled'?'disabled':'setup';
      next.telegram=integrationStatus('telegram'); next.ftp=integrationStatus('ftp-sftp'); next.mcp=integrationStatus('mcp');
      next.byok=flagMap.byok===false?'disabled':flagMap.byok===true?'ready':'unknown'; next.router='setup';
      setStatus(next);
      const catalog=await request('/api/models').catch(()=>({models:[]}));
      const rawRows=Array.isArray(cap.modelDescriptors)?cap.modelDescriptors:(Array.isArray(catalog.models)?catalog.models:[]);
      const rows=rawRows.map((m:any)=>typeof m==='string'?{id:m,displayName:m,selectable:cap.verified===true}:m);
      setModels(rows.filter((m:any)=>m && typeof m.id==='string' && m.selectable!==false));
      const prefs=me.authenticated?await request('/api/account/preferences').catch(()=>({})):({});
      setSelectedModel(prefs.preferences?.default_model||'');
    } catch {
      setError(t.statusError);
      setStatus({models:'unknown',local:'unknown',voice:'unknown',github:'unknown',telegram:'unknown',ftp:'unknown',mcp:'unknown',byok:'unknown',router:'unknown'});
    } finally { setStatusLoading(false); }
  };
  useEffect(()=>{void refreshStatus();},[]);

  const filtered = useMemo(()=>ITEMS.filter(item=>{
    const q=query.trim().toLowerCase();
    if(item.id==='byok' && featureFlags.byok===false) return false;
    return !q || [item.title,item.subtitle,item.group,...item.keywords].join(' ').toLowerCase().includes(q);
  }),[query,featureFlags]);
  const groups = ['Personalize','Your Assistant','Connections','Special Providers'];
  const statusLabel=(id:SettingId)=>{
    if(statusLoading)return t.checking;
    const value=status[id];
    if(value==='active'||value==='ready')return value==='active'?t.configured:t.available;
    if(value==='disabled')return t.disabled;
    return t.setup;
  };
  const isDisabled=(id:SettingId)=>status[id]==='disabled';
  const openGithub=async()=>{
    setError('');setNotice('');
    if(!authenticated){setError(t.signIn);return;}
    if(!github.configured){setError(t.setupText);return;}
    try{const data=await request('/api/integrations/github/start',{method:'POST',body:'{}'});if(!data.authUrl)throw new Error(t.setupText);window.location.assign(data.authUrl);}
    catch(e){setError(e instanceof Error?e.message:t.setupText);}
  };
  const unlinkGithub=async()=>{
    try{await request('/api/integrations/github/link',{method:'DELETE'});setGithub(v=>({...v,linked:false,username:''}));setStatus(v=>({...v,github:'ready'}));setNotice('GitHub account disconnected.');}
    catch(e){setError(e instanceof Error?e.message:'Could not disconnect GitHub.');}
  };
  const saveModel=async()=>{
    if(!authenticated){setError(t.signIn);return;}
    if(!selectedModel){setError(t.noModels);return;}
    try{
      await request('/api/account/preferences',{method:'PATCH',body:JSON.stringify({defaultModel:selectedModel,language,appearance:theme})});
      setNotice(t.modelSaved);
    }catch(e){setError(e instanceof Error?e.message:'Could not save the default model.');}
  };
  const selected = page ? ITEMS.find(item=>item.id===page) : null;
  const statusBadge=(id:SettingId)=><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status[id]==='active'?'bg-emerald-500/15 text-emerald-300':status[id]==='disabled'?'bg-slate-700 text-slate-400':'bg-amber-500/10 text-amber-300'}`}>{statusLabel(id)}</span>;
  const row=(item:Item)=><button key={item.id} type="button" disabled={isDisabled(item.id)} onClick={()=>{setPage(item.id);setError('');setNotice('');}} className={`group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cyan-400/5 disabled:cursor-not-allowed disabled:opacity-50 ${fa?'text-right':''}`}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/5 text-cyan-300"><item.icon className="h-5 w-5"/></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">{item.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.subtitle}</span></span>
    <span className="flex shrink-0 items-center gap-2">{(status[item.id]||item.id==='github')&&['github','models','local','voice','telegram','ftp','mcp','byok','router'].includes(item.id)&&statusBadge(item.id)}<ChevronRight className={`h-4 w-4 text-slate-500 ${fa?'rotate-180':''}`}/></span>
  </button>;

  if(context==='admin') return <section className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6">
    <button onClick={()=>setContext('user')} className="mb-3 inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4"/>{t.back}</button>
    <p className="mb-3 text-xs text-slate-400">{t.adminIntro}</p>
    <AfgAdminPanel language={language}/>
  </section>;

  return <section className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-6" dir={fa?'rtl':'ltr'}>
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black text-white">{fa?'تنظیمات':'Settings'}</h1><p className="mt-1 text-xs text-slate-400">{fa?'مرکز تنظیمات AFG AI':'Manage your AFG AI experience'}</p></div>
        <button type="button" onClick={()=>setContext('admin')} className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs font-bold text-cyan-200"><LockKeyhole className="mr-1 inline h-4 w-4"/>{t.admin}</button>
      </div>
      <label className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 focus-within:border-cyan-400"><Search className="h-5 w-5 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"/>{query&&<button type="button" onClick={()=>setQuery('')} className="text-xs text-cyan-300">×</button>}</label>
    </header>
    {error&&<p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}
    {page&&selected ? <div className="space-y-4 animate-in slide-in-from-right-2">
      <button type="button" onClick={()=>setPage(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className={`h-4 w-4 ${fa?'rotate-180':''}`}/>{t.back}</button>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><selected.icon className="h-5 w-5"/></span><div className="min-w-0 flex-1"><h2 className="font-black text-white">{selected.title}</h2><p className="text-xs text-slate-400">{selected.subtitle}</p></div>{['github','models','local','voice','telegram','ftp','mcp','byok','router'].includes(page)&&statusBadge(page)}</div>
      </div>
      {page==='files' && <AfgFileLibrary language={language}/>}
      {(['appearance','language','chat','memory','coding','privacy'] as SettingId[]).includes(page) && <>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-3">
          <p className="text-sm font-semibold text-cyan-100">{page==='language'?t.language:page==='appearance'?'Appearance':page==='chat'?'Chat preferences':page==='memory'?'Personal memory':page==='coding'?'Coding workspace':'Privacy & security'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{page==='language'?t.languageHelp:page==='memory'?'Manage memory consent, saved items and memory availability in the account controls below.':page==='privacy'?'Manage account security, active sessions, export and account deletion below.':page==='coding'?'Terminal and code execution stay unavailable until an administrator enables a verified sandbox.':page==='chat'?'Configure response style, length, creativity, default language and model preferences below.':'These controls are stored in your account when signed in; guest changes remain local to this device.'}</p>
        </div>
        {page==='language' && <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
          <label className="block text-sm font-semibold text-white">Application language
            <select value={language} onChange={e=>onSetLanguage(e.target.value as Language)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white">
              {LANGUAGE_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.native} — {option.label}</option>)}
            </select>
          </label>
          <p className="text-xs leading-5 text-slate-400">Date, number and regional formatting follow the selected language. Complete native translations are being rolled out; languages without a reviewed translation currently use English interface text.</p>
        </div>}
        <AfgAccountSettings language={language} theme={theme} onTheme={onSetTheme} onLanguage={onSetLanguage}/>
      </>}
      {page==='models'&&<div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <h3 className="font-bold text-white">{t.models}</h3>
        {models.length? <><label className="block text-xs text-slate-400">{t.defaultModel}<select value={selectedModel} onChange={e=>setSelectedModel(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white">{models.map(m=><option key={m.providerId+'::'+m.id} value={m.providerId+'::'+m.id}>{m.displayName||m.id}</option>)}</select></label><button onClick={()=>void saveModel()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950">{t.save}</button></>:<p className="text-sm text-slate-400">{t.noModels}</p>}
        <p className="text-xs text-slate-500">{status[page]==='ready'?t.available:t.setupText}</p>
      </div>}
      {page==='github'&&<div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <p className="text-sm text-slate-300">{github.linked?'GitHub account linked: @'+github.username:github.configured?t.githubReady:t.setupText}</p>
        {github.linked?<button onClick={()=>void unlinkGithub()} className="rounded-xl border border-rose-500/30 px-4 py-2 text-sm text-rose-300">{t.githubDisconnect}</button>:<button disabled={!github.configured||!authenticated} onClick={()=>void openGithub()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{t.githubConnect}</button>}
      </div>}
      {(['local','voice','telegram','ftp','mcp','byok','router'] as SettingId[]).includes(page)&&<div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
        <p className="text-sm font-semibold text-slate-200">{status[page]==='disabled'?t.disabledText:status[page]==='ready'||status[page]==='active'?t.available:t.setupText}</p>
        {page==='voice'&&<p className="text-xs text-slate-400">{t.notAvailable}</p>}
        {page==='local'&&<p className="text-xs text-slate-400">{t.notAvailable}</p>}
        {page==='telegram'&&<p className="text-xs text-slate-400">Telegram pairing is unavailable until the platform bot and pairing API are configured.</p>}
        {page==='ftp'&&<p className="text-xs text-slate-400">Remote credentials are not accepted until the encrypted personal FTP/SFTP API is enabled.</p>}
        {page==='mcp'&&<p className="text-xs text-slate-400">MCP runtime discovery is available only when a supported desktop agent is connected.</p>}
        {page==='byok'&&<p className="text-xs text-slate-400">BYOK remains hidden from active use until the administrator enables the feature and secure key vault.</p>}
        {page==='router'&&<p className="text-xs text-slate-400">A local router requires a device-side bridge; localhost on the server is not your phone.</p>}
      </div>}
      <button type="button" onClick={()=>void refreshStatus()} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300">Refresh backend status</button>
    </div> : <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><Settings2 className="h-5 w-5"/></div><div className="min-w-0"><p className="font-bold text-white">{language==='dari'?user.name:user.nameEn}</p><p className="text-xs text-slate-400">{user.email||'Guest account'}</p></div><span className="ml-auto text-[10px] font-bold text-cyan-300">{authenticated?'SIGNED IN':'GUEST'}</span></div>
      {filtered.length?groups.map((group,index)=>{const rows=filtered.filter(item=>item.group===group);if(!rows.length)return null;return <section key={group} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/75"><h2 className="px-4 pb-2 pt-4 text-[11px] font-black uppercase tracking-wider text-cyan-300">{groupLabels[index] || group}</h2><div className="divide-y divide-slate-800/80">{rows.map(row)}</div></section>}):<p className="rounded-2xl border border-slate-800 p-6 text-center text-sm text-slate-400">{t.noResults}</p>}
      <button type="button" onClick={onOpenShortcuts} className="w-full rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-300">Keyboard shortcuts</button>
    </div>}
    <div className="pb-4 text-center text-[10px] text-slate-600">AFG AI · Settings Hub</div>
  </section>;
};
