import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, LockKeyhole, RefreshCw, LogOut, LayoutDashboard, Users, Network,
  Cpu, Activity, Gauge, HardDrive, Flag, ClipboardList, ShieldAlert, CheckCircle2,
  Search, Play, Power, Save, Plus, AlertTriangle
} from 'lucide-react';
import type { Language } from '../../types/afg';
import { getIntlLocale } from '../../utils/i18n';

interface AfgAdminPanelProps { language: Language; }
type Tab = 'overview'|'users'|'providers'|'models'|'usage'|'limits'|'health'|'flags'|'audit'|'security';
type ProviderRow = { id:string; displayName:string; enabled:boolean; configured:boolean; configMessage?:string|null };
type ModelRow = {
  id:string; providerId:string; displayName:string; description?:string; contextWindow:number;
  enabled:boolean; verifiedAt:string|null; capabilities:Record<string,boolean>;
  inputCostPerMillion:number|null; outputCostPerMillion:number|null;
};
type UserRow = { id:string; email:string|null; display_name:string|null; role:string; status:string; created_at:string; last_seen_at:string|null; requests_30d:number };
type FallbackRow = { capability:string; ordered_models:string[]|string };
type RatePolicy = { id:string; scope_type:string; scope_key:string; requests:number; window_seconds:number; enabled:boolean };
type RequestRow = { request_id:string; method:string; route:string; status_code:number; duration_ms:number; classification:string; created_at:string };
type Overview = { usage:any[]; requests:any; users:any; storage:any };
const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const NAV: {id:Tab;labelEn:string;labelFa:string;icon:any}[] = [
  {id:'overview',labelEn:'Overview',labelFa:'نمای کلی',icon:LayoutDashboard},{id:'users',labelEn:'Users',labelFa:'کاربران',icon:Users},
  {id:'providers',labelEn:'Providers',labelFa:'ارائه‌دهندگان',icon:Network},{id:'models',labelEn:'Models & Routing',labelFa:'مدل‌ها و مسیریابی',icon:Cpu},
  {id:'usage',labelEn:'Usage & Errors',labelFa:'مصرف و خطاها',icon:Activity},{id:'limits',labelEn:'Rate Limits',labelFa:'محدودیت درخواست',icon:Gauge},
  {id:'health',labelEn:'Storage & Health',labelFa:'ذخیره‌سازی و سلامت',icon:HardDrive},{id:'flags',labelEn:'Flags & Announcements',labelFa:'امکانات و اطلاعیه‌ها',icon:Flag},
  {id:'audit',labelEn:'Audit Log',labelFa:'گزارش رویدادها',icon:ClipboardList},{id:'security',labelEn:'Security Events',labelFa:'رویدادهای امنیتی',icon:ShieldAlert},
];
const CAPABILITIES = ['text','streaming','vision','imageGen','imageEdit','ocr','tts','stt','tools','jsonMode'];

function csrfCookie(): string {
  const match = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='));
  return match ? decodeURIComponent(match.slice('afg_csrf='.length)) : '';
}
async function api(path:string, options:RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type','application/json');
  if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token',csrfCookie());
  const response = await fetch(`${API}${path}`,{...options,headers,credentials:'include'});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export const AfgAdminPanel: React.FC<AfgAdminPanelProps> = ({language}) => {
  const dari = language === 'dari';
  const locale = getIntlLocale(language);
  const fmt = (value:any) => value == null ? '—' : new Intl.NumberFormat(locale).format(Number(value));
  const date = (value:any) => value ? new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : (dari ? 'هرگز' : 'Never');
  const [authenticated,setAuthenticated] = useState(false);
  const [tab,setTab] = useState<Tab>('overview');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [bootstrapToken,setBootstrapToken] = useState('');
  const [displayName,setDisplayName] = useState('AFG AI Administrator');
  const [showBootstrap,setShowBootstrap] = useState(false);
  const [providers,setProviders] = useState<ProviderRow[]>([]);
  const [customProviderId,setCustomProviderId] = useState('');
  const [customProviderName,setCustomProviderName] = useState('');
  const [customProviderUrl,setCustomProviderUrl] = useState('');
  const [customProviderKey,setCustomProviderKey] = useState('');
  const [customProviderAuth,setCustomProviderAuth] = useState('bearer');
  const [models,setModels] = useState<ModelRow[]>([]);
  const [users,setUsers] = useState<UserRow[]>([]);
  const [overview,setOverview] = useState<Overview|null>(null);
  const [requests,setRequests] = useState<RequestRow[]>([]);
  const [security,setSecurity] = useState<any[]>([]);
  const [audit,setAudit] = useState<any[]>([]);
  const [policies,setPolicies] = useState<RatePolicy[]>([]);
  const [flags,setFlags] = useState<any[]>([]);
  const [health,setHealth] = useState<any|null>(null);
  const [fallbacks,setFallbacks] = useState<FallbackRow[]>([]);
  const [fallbackCapability,setFallbackCapability] = useState('text');
  const [fallbackText,setFallbackText] = useState('');
  const [newFlag,setNewFlag] = useState('');
  const [newFlagDescription,setNewFlagDescription] = useState('');
  const [rateScope,setRateScope] = useState('tier');
  const [rateKey,setRateKey] = useState('user');
  const [rateRequests,setRateRequests] = useState('60');
  const [rateWindow,setRateWindow] = useState('60');
  const [announcementTitle,setAnnouncementTitle] = useState('');
  const [announcementBody,setAnnouncementBody] = useState('');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const loadAdminData = useCallback(async ():Promise<boolean> => {
    setLoading(true); setError('');
    try {
      const paths = ['/api/admin/providers','/api/admin/models','/api/admin/fallbacks','/api/admin/users',
        '/api/admin/overview','/api/admin/requests','/api/admin/security-events','/api/admin/audit',
        '/api/admin/rate-limits','/api/admin/feature-flags'];
      const values = await Promise.all(paths.map((path)=>api(path)));
      setProviders(values[0].providers||[]); setModels(values[1].models||[]);
      setFallbacks(values[2].fallbacks||[]); setUsers(values[3].users||[]);
      setOverview(values[4]); setRequests(values[5].requests||[]);
      setSecurity(values[6].events||[]); setAudit(values[7].events||[]);
      setPolicies(values[8].policies||[]); setFlags(values[9].flags||[]);
      setAuthenticated(true); return true;
    } catch(err) {
      setError(err instanceof Error?err.message:'Could not load admin dashboard.');
      setAuthenticated(false); return false;
    } finally { setLoading(false); }
  },[]);

  const loadHealth = useCallback(async()=>{
    try { setHealth(await api('/api/admin/system-health')); }
    catch(err){setError(err instanceof Error?err.message:'Health check failed.');}
  },[]);
  useEffect(()=>{
    api('/api/auth/me').then((data)=>{if(data.authenticated&&data.user?.role==='admin') void loadAdminData();}).catch(()=>{});
  },[loadAdminData]);
  useEffect(()=>{
    const row=fallbacks.find((item)=>item.capability===fallbackCapability);
    const value=Array.isArray(row?.ordered_models)?row?.ordered_models:[];
    setFallbackText(value.join('\n'));
  },[fallbacks,fallbackCapability]);

  const signIn=async(bootstrap:boolean)=>{
    setLoading(true);setError('');setNotice('');
    try{
      await api(bootstrap?'/api/auth/bootstrap-admin':'/api/auth/login',{method:'POST',body:JSON.stringify(bootstrap?
        {email,password,displayName,bootstrapToken}:{email,password})});
      setBootstrapToken('');
      if(await loadAdminData()) setNotice('Administrator session established.');
    }catch(err){setError(err instanceof Error?err.message:'Authentication failed.');}
    finally{setLoading(false);}
  };
  const signOut=async()=>{
    try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}
    setAuthenticated(false);setProviders([]);setModels([]);setUsers([]);
  };
  const patchUser=async(user:UserRow,patch:Record<string,string>)=>{
    setError('');
    try{await api('/api/admin/users',{method:'PATCH',body:JSON.stringify({userId:user.id,...patch})});setNotice('User access updated.');await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'User update failed.');}
  };
  const patchModel=async(model:ModelRow,patch:Record<string,any>)=>{
    setError('');
    try{
      await api('/api/admin/models',{method:'PATCH',body:JSON.stringify({
        providerId:model.providerId,modelId:model.id,enabled:model.enabled,
        inputCostPerMillion:model.inputCostPerMillion,outputCostPerMillion:model.outputCostPerMillion,...patch
      })});
      await loadAdminData();setNotice('Model settings saved.');
    }catch(err){setError(err instanceof Error?err.message:'Model update failed.');}
  };
  const testProvider=async(provider:ProviderRow)=>{
    setError('');setNotice('Testing provider connection…');
    try{
      const result=await api('/api/admin/providers/test',{method:'POST',body:JSON.stringify({providerId:provider.id})});
      setNotice(`${provider.displayName}: connected · ${result.discoveredModels} models · ${result.latencyMs} ms`);
      await loadAdminData();
    }catch(err){setNotice('');setError(err instanceof Error?err.message:'Provider test failed.');}
  };
  const saveCustomProvider=async()=>{
    setError('');setNotice('');
    try {
      const result=await api('/api/admin/providers/custom',{method:'POST',body:JSON.stringify({
        providerId:customProviderId,displayName:customProviderName,baseUrl:customProviderUrl,
        apiKey:customProviderKey,authMethod:customProviderAuth,apiFormat:'openai_chat_completions',enabled:false
      })});
      setCustomProviderKey('');
      setNotice(result.message||'Encrypted provider configuration saved.');
      await loadAdminData();
    } catch(err) {
      setError(err instanceof Error?err.message:'Could not save custom provider.');
    }
  };
  const discoverModels=async()=>{
    setLoading(true);setError('');
    try{const result=await api('/api/admin/models/discover',{method:'POST',body:'{}'});setNotice(`Discovery complete: ${result.discovered} models, ${result.healthy} healthy.`);await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Model discovery failed.');}
    finally{setLoading(false);}
  };
  const saveFallback=async()=>{
    try{await api('/api/admin/fallbacks',{method:'PATCH',body:JSON.stringify({capability:fallbackCapability,orderedModels:fallbackText.split('\n').map(x=>x.trim()).filter(Boolean)})});await loadAdminData();setNotice('Default routing order saved.');}
    catch(err){setError(err instanceof Error?err.message:'Routing update failed.');}
  };
  const saveRate=async()=>{
    try{await api('/api/admin/rate-limits',{method:'PATCH',body:JSON.stringify({scopeType:rateScope,scopeKey:rateKey,requests:Number(rateRequests),windowSeconds:Number(rateWindow),enabled:true})});await loadAdminData();setNotice('Rate-limit policy saved.');}
    catch(err){setError(err instanceof Error?err.message:'Rate-limit update failed.');}
  };
  const toggleFlag=async(flag:any)=>{try{await api('/api/admin/feature-flags',{method:'PATCH',body:JSON.stringify({key:flag.flag_key,enabled:!flag.enabled,description:flag.description||''})});await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Feature flag update failed.');}};
  const createFlag=async()=>{
    if(!newFlag.trim())return;
    try{await api('/api/admin/feature-flags',{method:'PATCH',body:JSON.stringify({key:newFlag.trim(),enabled:false,description:newFlagDescription})});setNewFlag('');setNewFlagDescription('');await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Could not create flag.');}
  };
  const sendAnnouncement=async()=>{
    try{const result=await api('/api/admin/notifications/product-update',{method:'POST',body:JSON.stringify({title:announcementTitle,body:announcementBody})});setNotice(`Announcement delivered to ${result.recipientCount} opted-in users.`);setAnnouncementTitle('');setAnnouncementBody('');}
    catch(err){setError(err instanceof Error?err.message:'Announcement failed.');}
  };

  const filteredUsers=useMemo(()=>users.filter((u)=>[u.email,u.display_name,u.id].some((v)=>String(v||'').toLowerCase().includes(search.toLowerCase()))),[users,search]);
  const panel='rounded-2xl border border-slate-800 bg-slate-950/75 p-4 sm:p-5 shadow-lg shadow-black/10';
  const field='w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400';
  const primary='rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40';
  const secondary='rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/60';
  const stat=(label:string,value:any,detail:string,Icon:any)=><div className={panel}><div className="flex items-center justify-between"><span className="text-xs text-slate-400">{label}</span><Icon className="h-4 w-4 text-cyan-300"/></div><div className="mt-3 text-2xl font-black text-white">{fmt(value)}</div><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>;

  if(!authenticated)return <section className="mx-auto w-full max-w-xl px-4 py-10">
    <div className="rounded-3xl border border-cyan-800/50 bg-slate-950 p-6 sm:p-8 shadow-2xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10"><LockKeyhole className="h-7 w-7 text-cyan-300"/></div>
      <h1 className="text-center text-2xl font-black text-white">{dari?'ورود مدیر AFG AI':'AFG AI Admin Console'}</h1>
      <p className="mt-2 text-center text-sm text-slate-400">{dari?'دسترسی فقط برای مدیران مجاز است.':'Role-gated control center. Administrator access is required.'}</p>
      <div className="mt-6 space-y-3">
        <input className={field} value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Administrator email"/>
        <input className={field} value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password"/>
        {showBootstrap&&<><input className={field} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Administrator name"/><input className={field} value={bootstrapToken} onChange={e=>setBootstrapToken(e.target.value)} type="password" placeholder="One-time bootstrap token"/><p className="text-xs text-amber-300">Requires AFG_ADMIN_BOOTSTRAP_TOKEN on the server.</p></>}
        <button className={primary+' w-full'} disabled={loading||!email||!password||(showBootstrap&&!bootstrapToken)} onClick={()=>void signIn(showBootstrap)}>{loading?'…':showBootstrap?'Create first administrator':'Sign in securely'}</button>
        <button className="w-full py-2 text-xs text-cyan-300 underline" onClick={()=>setShowBootstrap(v=>!v)}>{showBootstrap?'Back to sign in':'Set up first administrator'}</button>
      </div>
      {error&&<p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    </div>
  </section>;

  return <section className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 lg:px-7 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 ring-1 ring-cyan-400/30"><ShieldCheck className="h-6 w-6 text-cyan-300"/></div><div><h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">AFG AI <span className="text-cyan-300">Admin</span></h1><p className="text-xs text-slate-500">Operations · Security · Platform control</p></div></div>
      <div className="flex gap-2"><button className={secondary+' flex items-center gap-2'} onClick={()=>void loadAdminData()}><RefreshCw className="h-4 w-4"/><span>Refresh</span></button><button className={secondary+' flex items-center gap-2'} onClick={()=>void signOut()}><LogOut className="h-4 w-4"/><span>Sign out</span></button></div>
    </header>
    {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {notice&&<div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {NAV.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setTab(item.id)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${tab===item.id?'border-cyan-400/60 bg-cyan-400/10 text-cyan-200':'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600'}`}><Icon className="h-4 w-4 shrink-0"/>{dari ? item.labelFa : item.labelEn}</button>;})}
    </div>
    {loading&&<div className="h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400"/></div>}

    {tab==='overview'&&<div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stat('Total users',overview?.users?.total,'Registered accounts',Users)}
        {stat('Active users',overview?.users?.active,'Accounts currently active',Activity)}
        {stat('Requests · 24h',overview?.requests?.total,'Observed API requests',Activity)}
        {stat('Server errors · 24h',overview?.requests?.server_errors,'HTTP 5xx responses',AlertTriangle)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className={panel+' xl:col-span-2'}><div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-white">Request & token activity</h2><span className="text-[11px] text-slate-500">Last 14 days · UTC</span></div>
          <div className="flex h-44 items-end gap-2 border-b border-slate-800 pb-2">{(overview?.usage||[]).map((item:any,i:number)=>{const max=Math.max(1,...(overview?.usage||[]).map((x:any)=>Number(x.requests)));const h=Math.max(3,Number(item.requests)/max*100);return <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"><div title={`${item.requests} requests · ${fmt(item.tokens)} tokens`} style={{height:h+'%'}} className="w-full rounded-t-md bg-gradient-to-t from-cyan-700 to-cyan-300"/><span className="truncate text-center text-[9px] text-slate-500">{new Intl.DateTimeFormat(locale,{day:'numeric',month:'short'}).format(new Date(item.day))}</span></div>;})}{!overview?.usage?.length&&<p className="m-auto text-xs text-slate-500">No usage events recorded yet.</p>}</div>
        </div>
        <div className={panel}><h2 className="font-bold text-white">Platform snapshot</h2><div className="mt-4 space-y-4 text-sm"><div className="flex justify-between"><span className="text-slate-400">Suspended accounts</span><b className="text-white">{fmt(overview?.users?.suspended)}</b></div><div className="flex justify-between"><span className="text-slate-400">Client errors · 24h</span><b className="text-white">{fmt(overview?.requests?.client_errors)}</b></div><div className="flex justify-between"><span className="text-slate-400">API successes · 24h</span><b className="text-emerald-300">{fmt(overview?.requests?.successful)}</b></div><div className="flex justify-between"><span className="text-slate-400">Database</span><b className="text-white">{overview?.storage?'Connected':'Unknown'}</b></div></div></div>
      </div>
      <div className={panel}><h2 className="mb-3 font-bold text-white">Recent API errors</h2><RequestTable rows={requests.filter(r=>r.status_code>=400).slice(0,8)} language={language}/></div>
    </div>}

    {tab==='users'&&<div className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">User management</h2><p className="text-xs text-slate-500">Suspend access, revoke sessions, and assign roles.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input className={field+' pl-9'} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email or user ID"/></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-slate-500"><tr>{['User','Role','Status','Last activity','Requests 30d','Actions'].map(x=><th key={x} className="border-b border-slate-800 px-3 py-3">{x}</th>)}</tr></thead><tbody>{filteredUsers.map(u=><tr key={u.id} className="border-b border-slate-900"><td className="px-3 py-3"><p className="font-semibold text-white">{u.display_name||u.email||'Unnamed user'}</p><p className="mt-1 text-[10px] text-slate-500">{u.email} · {u.id.slice(0,8)}</p></td><td className="px-3 py-3 text-slate-300">{u.role}</td><td className="px-3 py-3"><span className={u.status==='active'?'text-emerald-300':'text-amber-300'}>{u.status}</span></td><td className="px-3 py-3 text-slate-400">{date(u.last_seen_at)}</td><td className="px-3 py-3 text-slate-300">{fmt(u.requests_30d)}</td><td className="px-3 py-3"><div className="flex gap-2"><button className={secondary} onClick={()=>void patchUser(u,{status:u.status==='active'?'suspended':'active'})}>{u.status==='active'?'Suspend':'Reactivate'}</button><button className={secondary} onClick={()=>void patchUser(u,{role:u.role==='admin'?'user':'admin'})}>{u.role==='admin'?'Demote':'Make admin'}</button></div></td></tr>)}</tbody></table>{!filteredUsers.length&&<p className="py-8 text-center text-sm text-slate-500">No users found.</p>}</div>
    </div>}

    {tab==='providers'&&<div className="space-y-4">
      <div className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Provider control</h2><p className="text-xs text-slate-500">Only credential presence is shown. Secret values are never returned.</p></div><button className={primary+' flex items-center gap-2'} onClick={()=>void discoverModels()}><Play className="h-4 w-4"/>Discover models</button></div>
      <div className="grid gap-3 md:grid-cols-2">{providers.map(p=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-white">{p.displayName}</h3><p className="mt-1 text-xs text-slate-500">{p.id}</p></div><span className={p.configured?'text-emerald-300':'text-amber-300'}>{p.configured?'Configured':(p.configMessage||'Missing credentials')}</span></div><div className="mt-4 flex flex-wrap gap-2"><button className={secondary+' flex items-center gap-2'} onClick={()=>void testProvider(p)}><Play className="h-3.5 w-3.5"/>Test connection</button><button className={secondary+' flex items-center gap-2'} onClick={()=>void api('/api/admin/providers',{method:'PATCH',body:JSON.stringify({providerId:p.id,enabled:!p.enabled})}).then(loadAdminData).catch(e=>setError(e.message))}><Power className="h-3.5 w-3.5"/>{p.enabled?'Disable':'Enable'}</button></div></div>)}</div>
      </div>
      <div className={panel}><h3 className="font-bold text-white">Add custom OpenAI-compatible provider</h3><p className="my-2 text-xs text-slate-500">Credentials are encrypted on the server. Configure the backend encryption key first. New providers are saved disabled; test and enable them after setup.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Provider ID<input className={field+' mt-1'} value={customProviderId} onChange={e=>setCustomProviderId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} placeholder="custom-my-provider"/></label>
          <label className="text-xs text-slate-400">Display name<input className={field+' mt-1'} value={customProviderName} onChange={e=>setCustomProviderName(e.target.value)} placeholder="My AI Provider"/></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Base URL<input className={field+' mt-1'} value={customProviderUrl} onChange={e=>setCustomProviderUrl(e.target.value)} placeholder="https://api.example.com/v1"/></label>
          <label className="text-xs text-slate-400">Credential<input type="password" autoComplete="new-password" className={field+' mt-1'} value={customProviderKey} onChange={e=>setCustomProviderKey(e.target.value)} placeholder="Stored encrypted"/></label>
          <label className="text-xs text-slate-400">Authentication<select className={field+' mt-1'} value={customProviderAuth} onChange={e=>setCustomProviderAuth(e.target.value)}><option value="bearer">Bearer token</option><option value="api-key-header">API key header</option><option value="none">No authentication</option></select></label>
        </div>
        <button className={primary+' mt-4 flex items-center gap-2'} disabled={!customProviderId.startsWith('custom-')||!customProviderName.trim()||!customProviderUrl.trim()||(customProviderAuth!=='none'&&!customProviderKey.trim())||loading} onClick={()=>void saveCustomProvider()}><Plus className="h-4 w-4"/>Save encrypted provider</button>
      </div>
    </div>}

    {tab==='models'&&<div className="space-y-4"><div className={panel}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Model catalogue</h2><p className="text-xs text-slate-500">Toggle availability and capability overrides per discovered model.</p></div><button className={primary} onClick={()=>void discoverModels()}>Discover / refresh</button></div>
      <div className="space-y-3">{models.map(m=><div key={m.providerId+':'+m.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-white">{m.displayName}</p><p className="text-[10px] text-slate-500">{m.providerId} · {m.id} · {fmt(m.contextWindow)} context</p></div><button className={m.enabled?primary:secondary} onClick={()=>void patchModel(m,{enabled:!m.enabled})}>{m.enabled?'Enabled':'Disabled'}</button></div><div className="mt-3 flex flex-wrap gap-2">{CAPABILITIES.map(cap=><label key={cap} className="flex items-center gap-1 rounded-lg border border-slate-800 px-2 py-1 text-[10px] text-slate-300"><input type="checkbox" checked={Boolean(m.capabilities?.[cap])} onChange={e=>{const next={...m.capabilities,[cap]:e.target.checked};void patchModel(m,{capabilities:Object.keys(next).filter(k=>next[k])});}}/>{cap}</label>)}</div><p className="mt-2 text-[10px] text-slate-500">{m.verifiedAt?'Health verified '+date(m.verifiedAt):'Not currently verified'}</p></div>)}</div>{!models.length&&<p className="text-sm text-slate-500">No discovered models available.</p>}</div>
      <div className={panel}><h2 className="font-bold text-white">Default routing / fallback order</h2><p className="my-2 text-xs text-slate-500">One providerId::modelId per line. First healthy eligible model is preferred.</p><select className={field+' mb-3'} value={fallbackCapability} onChange={e=>setFallbackCapability(e.target.value)}>{['text','vision','imageGen','tts','stt'].map(x=><option key={x}>{x}</option>)}</select><textarea className={field+' font-mono'} rows={5} value={fallbackText} onChange={e=>setFallbackText(e.target.value)}/><button className={primary+' mt-3 flex items-center gap-2'} onClick={()=>void saveFallback()}><Save className="h-4 w-4"/>Save routing order</button></div>
    </div>}

    {tab==='usage'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Usage and request errors</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Requests 24h</p><b className="text-xl text-white">{fmt(overview?.requests?.total)}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Success</p><b className="text-xl text-emerald-300">{fmt(overview?.requests?.successful)}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">4xx</p><b className="text-xl text-amber-300">{fmt(overview?.requests?.client_errors)}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">5xx</p><b className="text-xl text-red-300">{fmt(overview?.requests?.server_errors)}</b></div></div></div><div className={panel}><h3 className="mb-3 font-bold text-white">Recent requests · Request IDs</h3><RequestTable rows={requests} language={language}/></div></div>}

    {tab==='limits'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Rate-limit policy</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select className={field} value={rateScope} onChange={e=>setRateScope(e.target.value)}><option value="user">Per user</option><option value="tier">Per tier</option><option value="model">Per model</option></select><input className={field} value={rateKey} onChange={e=>setRateKey(e.target.value)} placeholder="User ID / role (user/admin) / model ID"/><input className={field} type="number" min="1" value={rateRequests} onChange={e=>setRateRequests(e.target.value)} placeholder="Requests"/><input className={field} type="number" min="1" value={rateWindow} onChange={e=>setRateWindow(e.target.value)} placeholder="Window seconds"/></div><button className={primary+' mt-3'} onClick={()=>void saveRate()}>Save policy</button><p className="mt-2 text-xs text-slate-500">User and role-based limits are enforced by the API gateway. Model limits are enforced when the client sends its selected model header.</p></div><div className={panel}><h3 className="mb-3 font-bold text-white">Configured policies</h3><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs"><thead className="text-slate-500"><tr>{['Scope','Key','Limit','Window','Status'].map(x=><th key={x} className="border-b border-slate-800 p-3">{x}</th>)}</tr></thead><tbody>{policies.map(p=><tr key={p.id} className="border-b border-slate-900 text-slate-300"><td className="p-3">{p.scope_type}</td><td className="p-3">{p.scope_key}</td><td className="p-3">{p.requests} requests</td><td className="p-3">{p.window_seconds}s</td><td className="p-3">{p.enabled?'Enabled':'Disabled'}</td></tr>)}</tbody></table></div></div></div>}

    {tab==='health'&&<div className="space-y-4"><div className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">System health</h2><p className="text-xs text-slate-500">Live database and provider checks. Queue state is reported honestly when not configured.</p></div><button className={primary} onClick={()=>void loadHealth()}>Run health check</button></div>{health&&<div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2 text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300"/>Database</div><p className="mt-2 text-sm text-slate-300">{health.database?.healthy?'Healthy':'Unavailable'} · {fmt(health.database?.latencyMs)} ms</p></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2 text-white"><Activity className="h-4 w-4 text-cyan-300"/>Queues</div><p className="mt-2 text-sm text-slate-300">{health.queues?.status||'Unknown'}</p></div>{(health.providers||[]).map((p:any)=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><p className="font-semibold text-white">{p.id}</p><p className={p.healthy?'text-emerald-300':'text-amber-300'}>{p.healthy?'Healthy':'Unavailable'} · {p.latencyMs==null?'—':p.latencyMs+' ms'}</p></div>)}</div>}</div><div className={panel}><h3 className="mb-3 font-bold text-white">Storage usage</h3><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">PostgreSQL database</p><b className="text-xl text-white">{overview?.storage?.database_bytes? new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(overview.storage.database_bytes)/1048576)+' MB':'—'}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Generated asset records</p><b className="text-xl text-white">{fmt(overview?.storage?.asset_records)}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Conversations</p><b className="text-xl text-white">{fmt(overview?.storage?.conversations)}</b></div></div><p className="mt-3 text-xs text-slate-500">R2: {overview?.storage?.r2Configured?'Configured':'Not configured / unknown'} · KV: {overview?.storage?.kvConfigured?'Configured':'Not configured / unknown'}. External bucket byte usage is not available through the current adapter.</p></div></div>}

    {tab==='flags'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Feature flags</h2><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className={field} value={newFlag} onChange={e=>setNewFlag(e.target.value)} placeholder="feature.key"/><input className={field} value={newFlagDescription} onChange={e=>setNewFlagDescription(e.target.value)} placeholder="Description"/><button className={primary+' flex items-center justify-center gap-2'} onClick={()=>void createFlag()}><Plus className="h-4 w-4"/>Add flag</button></div><div className="mt-4 space-y-2">{flags.map(flag=><div key={flag.flag_key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><p className="font-semibold text-white">{flag.flag_key}</p><p className="text-xs text-slate-500">{flag.description}</p></div><button className={flag.enabled?primary:secondary} onClick={()=>void toggleFlag(flag)}>{flag.enabled?'Enabled':'Disabled'}</button></div>)}</div></div><div className={panel}><h2 className="mb-2 font-bold text-white">Product announcement</h2><p className="mb-3 text-xs text-slate-500">Delivered in-app only to users who opted into product updates.</p><input className={field+' mb-2'} value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} maxLength={120} placeholder="Announcement title"/><textarea className={field} rows={4} value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} maxLength={2000} placeholder="Announcement message"/><button className={primary+' mt-3'} disabled={!announcementTitle.trim()||!announcementBody.trim()} onClick={()=>void sendAnnouncement()}>Send announcement</button></div></div>}

    {tab==='audit'&&<div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Immutable audit log</h2><p className="mb-4 text-xs text-slate-500">Append-only database trigger prevents UPDATE and DELETE operations.</p><div className="space-y-2">{audit.map(a=><div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-xs text-cyan-200">{a.action}</b><span className="text-[10px] text-slate-500">{date(a.created_at)}</span></div><p className="mt-1 text-xs text-slate-300">{a.actor_email||'System'} · {a.target_type||'—'} / {a.target_id||'—'}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(a.metadata)}</pre></div>)}{!audit.length&&<p className="text-sm text-slate-500">No audit events yet.</p>}</div></div>}

    {tab==='security'&&<div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Security events feed</h2><p className="mb-4 text-xs text-slate-500">Authentication denials and API server failures. Sensitive credential values are excluded.</p><div className="space-y-2">{security.map(e=><div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={e.severity==='critical'?'text-red-300':e.severity==='warning'?'text-amber-300':'text-cyan-300'}><ShieldAlert className="h-4 w-4"/></span><b className="text-sm text-white">{e.event_type}</b></div><span className="text-[10px] text-slate-500">{date(e.created_at)}</span></div><p className="mt-1 text-[10px] text-slate-400">Severity: {e.severity} · User: {e.user_id||'unknown'} · Request: {e.request_id||'—'}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(e.metadata)}</pre></div>)}{!security.length&&<p className="text-sm text-slate-500">No security events recorded.</p>}</div></div>}
  </section>;
};

const RequestTable:React.FC<{rows:RequestRow[];language:Language}> = ({rows,language}) => <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-slate-500"><tr>{['Request ID','Route','Status','Duration','Classified','Time'].map(x=><th key={x} className="border-b border-slate-800 p-2">{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.request_id+i} className="border-b border-slate-900"><td className="p-2 font-mono text-cyan-200">{r.request_id}</td><td className="p-2 text-slate-300">{r.method} {r.route}</td><td className="p-2 text-slate-300">{r.status_code}</td><td className="p-2 text-slate-300">{r.duration_ms} ms</td><td className="p-2 text-slate-400">{r.classification}</td><td className="p-2 text-slate-500">{new Intl.DateTimeFormat(getIntlLocale(language),{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.created_at))}</td></tr>)}</tbody></table>{!rows.length&&<p className="py-5 text-center text-xs text-slate-500">No request telemetry recorded yet.</p>}</div>;
