import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, LockKeyhole, RefreshCw, LogOut, LayoutDashboard, Users, Network,
  Cpu, Activity, Gauge, HardDrive, Flag, ClipboardList, ShieldAlert, CheckCircle2,
  Search, Play, Power, Save, Plus, AlertTriangle
} from 'lucide-react';
import type { Language } from '../../types/afg';
import { getIntlLocale } from '../../utils/i18n';

interface AfgAdminPanelProps { language: Language; }
type Tab = 'overview'|'users'|'providers'|'models'|'usage'|'errors'|'limits'|'health'|'config'|'flags'|'audit'|'security';
type ProviderRow = { id:string; displayName:string; enabled:boolean; configured:boolean; kind?:string; base_url?:string|null; keyHint?:string|null; keyStatus?:string|null; last_health_at?:string|null; last_health_ok?:boolean|null; source?:string };
type ModelRow = {
  id:string; providerId:string; displayName:string; description?:string; contextWindow:number;
  enabled:boolean; verifiedAt:string|null; capabilities:Record<string,boolean>;
  inputCostPerMillion:number|null; outputCostPerMillion:number|null; lastHealthOk?:boolean; discoveredAt?:string|null;
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
  {id:'usage',labelEn:'Usage',labelFa:'مصرف',icon:Activity},{id:'errors',labelEn:'Errors',labelFa:'خطاها',icon:AlertTriangle},{id:'limits',labelEn:'Rate Limits',labelFa:'محدودیت درخواست',icon:Gauge},
  {id:'health',labelEn:'Storage & Health',labelFa:'ذخیره‌سازی و سلامت',icon:HardDrive},{id:'config',labelEn:'Configuration',labelFa:'تنظیمات سیستم',icon:Gauge},{id:'flags',labelEn:'Flags & Announcements',labelFa:'امکانات و اطلاعیه‌ها',icon:Flag},
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
  const [adminRole,setAdminRole] = useState<'admin'|'superadmin'|null>(null);
  const isSuperadmin = adminRole === 'superadmin';
  const [tab,setTab] = useState<Tab>('overview');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [bootstrapToken,setBootstrapToken] = useState('');
  const [displayName,setDisplayName] = useState('AFG AI Administrator');
  const [showBootstrap,setShowBootstrap] = useState(false);
  const [providers,setProviders] = useState<ProviderRow[]>([]);
  const [providerSecrets,setProviderSecrets] = useState<Record<string,string>>({});
  const [customSlug,setCustomSlug] = useState('');
  const [customName,setCustomName] = useState('');
  const [customBaseUrl,setCustomBaseUrl] = useState('');
  const [models,setModels] = useState<ModelRow[]>([]);
  const [manualProviderId,setManualProviderId] = useState('deepseek');
  const [manualModelId,setManualModelId] = useState('');
  const [manualModelName,setManualModelName] = useState('');
  const [manualContext,setManualContext] = useState('');
  const [users,setUsers] = useState<UserRow[]>([]);
  const [overview,setOverview] = useState<Overview|null>(null);
  const [requests,setRequests] = useState<RequestRow[]>([]);
  const [usageRecords,setUsageRecords] = useState<any[]>([]);
  const [usageSummary,setUsageSummary] = useState<any|null>(null);
  const [errorRows,setErrorRows] = useState<any[]>([]);
  const [sessions,setSessions] = useState<any[]>([]);
  const [systemConfig,setSystemConfig] = useState<any[]>([]);
  const [usageFrom,setUsageFrom] = useState('');
  const [usageTo,setUsageTo] = useState('');
  const [usageProvider,setUsageProvider] = useState('');
  const [usageModel,setUsageModel] = useState('');
  const [errorFrom,setErrorFrom] = useState('');
  const [errorTo,setErrorTo] = useState('');
  const [errorClass,setErrorClass] = useState('');
  const [errorModel,setErrorModel] = useState('');
  const [announcements,setAnnouncements] = useState<any[]>([]);
  const [configKey,setConfigKey] = useState('daily_cost_threshold_usd');
  const [configValue,setConfigValue] = useState('25');
  const [selectedUser,setSelectedUser] = useState<any|null>(null);
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
        '/api/admin/rate-limits','/api/admin/feature-flags','/api/admin/usage','/api/admin/errors',
        '/api/admin/sessions','/api/admin/config','/api/admin/announcements'];
      const values = await Promise.all(paths.map((path)=>api(path)));
      setProviders(values[0].providers||[]); setModels(values[1].models||[]);
      setFallbacks(values[2].fallbacks||[]); setUsers(values[3].users||[]);
      setOverview(values[4]); setRequests(values[5].requests||[]);
      setSecurity(values[6].events||[]); setAudit(values[7].events||[]);
      setPolicies(values[8].policies||[]); setFlags(values[9].flags||[]);
      setUsageRecords(values[10].records||[]);setUsageSummary(values[10].summary||null);
      setErrorRows(values[11].errors||[]);setSessions(values[12].sessions||[]);
      setSystemConfig(values[13].config||[]);setAnnouncements(values[14].announcements||[]);
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
    api('/api/auth/me').then((data)=>{if(data.authenticated&&['admin','superadmin'].includes(data.user?.role)){setAdminRole(data.user.role);void loadAdminData();}}).catch(()=>{});
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
      const session=await api('/api/auth/me');
      if(session.user?.role==='admin'||session.user?.role==='superadmin')setAdminRole(session.user.role);
      if(await loadAdminData()) setNotice('Administrator session established.');
    }catch(err){setError(err instanceof Error?err.message:'Authentication failed.');}
    finally{setLoading(false);}
  };
  const signOut=async()=>{
    try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch{}
    setAuthenticated(false);setAdminRole(null);setProviders([]);setModels([]);setUsers([]);
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
      const result=await api('/api/admin/providers/'+encodeURIComponent(provider.id)+'/test',{method:'POST',body:'{}'});
      setNotice(`${provider.displayName}: connected · ${result.discoveredModels} models · ${result.latencyMs} ms`);
      await loadAdminData();
    }catch(err){setNotice('');setError(err instanceof Error?err.message:'Provider test failed.');}
  };
  const discoverModels=async()=>{
    setLoading(true);setError('');
    try{const result=await api('/api/admin/models/discover',{method:'POST',body:'{}'});setNotice(`Discovery complete: ${result.discovered} models, ${result.healthy} healthy.`);await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Model discovery failed.');}
    finally{setLoading(false);}
  };
  const discoverProvider=async(provider:ProviderRow)=>{
    setError('');setNotice(`Discovering models from ${provider.displayName}…`);
    try{const result=await api('/api/admin/providers/'+encodeURIComponent(provider.id)+'/discover-models',{method:'POST',body:'{}'});
      setNotice(`${provider.displayName}: discovered ${result.discovered} models. All new entries are disabled pending review.`);await loadAdminData();}
    catch(err){setNotice('');setError(err instanceof Error?err.message:'Provider model discovery failed.');}
  };
  const saveProviderKey=async(provider:ProviderRow,rotate=false)=>{
    const apiKey=(providerSecrets[provider.id]||'').trim();if(!apiKey){setError('Enter the provider API key first.');return;}
    if(!isSuperadmin){setError('Only superadmin can manage provider keys.');return;}
    const currentPassword=window.prompt('Re-authenticate: enter your current administrator password.');
    if(!currentPassword){setError('Password confirmation is required.');return;}
    try{const route='/api/admin/providers/'+encodeURIComponent(provider.id)+'/keys'+(rotate?'/rotate':'');
      await api(route,{method:rotate?'POST':'PUT',body:JSON.stringify({apiKey,alias:'default',currentPassword})});
      setProviderSecrets(current=>({...current,[provider.id]:''}));setNotice(`${provider.displayName} key securely saved.`);await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Provider key could not be saved.');}
  };
  const createCustomProvider=async()=>{
    try{const result=await api('/api/admin/providers/custom',{method:'POST',body:JSON.stringify({slug:customSlug,displayName:customName,baseUrl:customBaseUrl,protocol:'openai-compatible'})});
      setCustomSlug('');setCustomName('');setCustomBaseUrl('');setNotice(`Custom provider ${result.provider.slug} created. Add a key from the provider card.`);await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Custom provider could not be created.');}
  };
  const testModel=async(model:ModelRow)=>{
    try{const result=await api('/api/admin/models/test',{method:'POST',body:JSON.stringify({providerId:model.providerId,modelId:model.id})});
      setNotice(result.healthy?`${model.id}: verified successfully.`:`${model.id}: health check failed.`);await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Model health check failed.');}
  };
  const addManualModel=async()=>{
    try{await api('/api/admin/models/manual',{method:'POST',body:JSON.stringify({providerId:manualProviderId,modelId:manualModelId,displayName:manualModelName,contextWindow:manualContext?Number(manualContext):0})});
      setManualModelId('');setManualModelName('');setManualContext('');setNotice('Model registered as disabled and unverified. Run its health check after configuring the provider.');await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Manual model registration failed.');}
  };

  const deleteModel=async(model:ModelRow)=>{
    if(!window.confirm(`Delete model ${model.id} from ${model.providerId}? This cannot be undone.`))return;
    try{await api('/api/admin/models',{method:'DELETE',body:JSON.stringify({providerId:model.providerId,modelId:model.id})});setNotice('Model deleted from catalogue.');await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Model deletion failed.');}
  };

  const loadUsage=async()=>{
    const params=new URLSearchParams();
    if(usageFrom)params.set('from',new Date(usageFrom).toISOString());
    if(usageTo)params.set('to',new Date(usageTo).toISOString());
    if(usageProvider)params.set('provider',usageProvider);
    if(usageModel)params.set('model',usageModel);
    try{const result=await api('/api/admin/usage'+(params.size?'?'+params.toString():''));setUsageRecords(result.records||[]);setUsageSummary(result.summary||null);}
    catch(err){setError(err instanceof Error?err.message:'Usage data could not be loaded.');}
  };
  const loadErrors=async()=>{
    const params=new URLSearchParams();
    if(errorFrom)params.set('from',new Date(errorFrom).toISOString());
    if(errorTo)params.set('to',new Date(errorTo).toISOString());
    if(errorClass)params.set('class',errorClass);
    if(errorModel)params.set('model',errorModel);
    try{const result=await api('/api/admin/errors'+(params.size?'?'+params.toString():''));setErrorRows(result.errors||[]);}
    catch(err){setError(err instanceof Error?err.message:'Error records could not be loaded.');}
  };
  const openUserProfile=async(user:UserRow)=>{
    try{const result=await api('/api/admin/users/'+encodeURIComponent(user.id));setSelectedUser(result.user||null);}
    catch(err){setError(err instanceof Error?err.message:'Could not load user profile.');}
  };
  const confirmUserChange=async(user:UserRow,patch:Record<string,string>)=>{
    const identity=user.email||user.display_name||user.id;
    const entered=window.prompt(`Confirm this sensitive change by typing exactly: ${identity}`);
    if(entered!==identity){setError('Confirmation did not match. No change was made.');return;}
    if(patch.status==='deleted'){
      const currentPassword=window.prompt('Re-authenticate: enter your current administrator password.');
      if(!currentPassword){setError('Password confirmation is required.');return;}
      await api('/api/admin/users',{method:'PATCH',body:JSON.stringify({userId:user.id,...patch,currentPassword})});
      setNotice('Account soft-deleted.');await loadAdminData();return;
    }
    await patchUser(user,patch);
  };
  const revokeSession=async(session:any)=>{
    if(!window.confirm('Revoke this active session? The device will need to sign in again.'))return;
    try{await api('/api/admin/sessions/'+encodeURIComponent(session.id),{method:'DELETE'});setNotice('Session revoked.');await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Session could not be revoked.');}
  };
  const saveSystemConfig=async()=>{
    let parsed:any;
    try{parsed=JSON.parse(configValue);}catch{parsed=configValue;}
    try{await api('/api/admin/config/'+encodeURIComponent(configKey),{method:'PUT',body:JSON.stringify({value:parsed})});
      setNotice('System configuration saved.');await loadAdminData();}
    catch(err){setError(err instanceof Error?err.message:'Configuration update failed.');}
  };
  const exportErrors=()=>{
    const params=new URLSearchParams();
    if(errorFrom)params.set('from',new Date(errorFrom).toISOString());
    if(errorTo)params.set('to',new Date(errorTo).toISOString());
    window.open(API+'/api/admin/errors/export'+(params.size?'?'+params.toString():''),'_blank','noopener,noreferrer');
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
    try{
      const saved=await api('/api/admin/announcements',{method:'POST',body:JSON.stringify({title:announcementTitle,body:announcementBody})});
      const delivered=await api('/api/admin/notifications/product-update',{method:'POST',body:JSON.stringify({title:announcementTitle,body:announcementBody})});
      setNotice(`Announcement ${saved.announcement?.id||''} published; ${delivered.recipientCount} opted-in users notified.`);
      setAnnouncementTitle('');setAnnouncementBody('');await loadAdminData();
    }catch(err){setError(err instanceof Error?err.message:'Announcement could not be published and delivered.');}
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {stat('Active users today',overview?.dashboard?.activeUsersToday,'Users with an AI request today',Users)}
        {stat('AI requests today',overview?.dashboard?.aiRequestsToday,'Recorded model requests',Activity)}
        {stat('Error rate',overview?.dashboard?.errorRatePercent==null?'—':Number(overview.dashboard.errorRatePercent).toFixed(2)+'%','Failed AI requests today',AlertTriangle)}
        {stat('Average latency',overview?.dashboard?.averageLatencyMs==null?'—':fmt(overview.dashboard.averageLatencyMs)+' ms','AI request average',Gauge)}
        {stat("Today's cost",overview?.dashboard?.todayCostUsd==null?'—':'$'+Number(overview.dashboard.todayCostUsd).toFixed(4),'Recorded model cost · USD',HardDrive)}
      </div>
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-white">Urgent system alerts</h2><p className="text-xs text-slate-500">Derived from current provider, model, usage and error records.</p></div><button className={secondary} onClick={()=>void loadAdminData()}>Refresh alerts</button></div>
        {(overview?.dashboard?.alerts||[]).length>0?<div className="mt-3 grid gap-2 md:grid-cols-2">{overview.dashboard.alerts.map((alert:any,i:number)=><div key={alert.kind+i} className={'rounded-xl border p-3 '+(alert.severity==='critical'?'border-red-500/30 bg-red-500/5':'border-amber-500/30 bg-amber-500/5')}>
          <div className="flex items-center justify-between gap-2"><b className={alert.severity==='critical'?'text-red-300':'text-amber-300'}>{alert.kind.replace(/_/g,' ')}</b><span className="text-[10px] text-slate-500">{alert.count??''}</span></div><p className="mt-1 text-xs text-slate-300">{alert.message}</p>
        </div>)}</div>:<p className="mt-4 text-sm text-emerald-300">No urgent alerts recorded.</p>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={panel}><h2 className="mb-3 font-bold text-white">Requests by provider · 24h</h2>
          {(overview?.dashboard?.requestsByProvider||[]).map((item:any)=>{const max=Math.max(1,...(overview?.dashboard?.requestsByProvider||[]).map((v:any)=>Number(v.requests)));return <div key={item.provider_key||'unknown'} className="mb-3"><div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">{item.provider_key||'Unknown provider'}</span><span className="text-slate-400">{fmt(item.requests)} · ${Number(item.cost_usd||0).toFixed(4)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{width:(Number(item.requests)/max*100)+'%'}}/></div></div>})}
          {!(overview?.dashboard?.requestsByProvider||[]).length&&<p className="text-xs text-slate-500">No provider usage recorded for this period.</p>}
        </div>
        <div className={panel}><h2 className="mb-3 font-bold text-white">Errors by class · 24h</h2>
          {(overview?.dashboard?.errorsByClass||[]).map((item:any)=>{const max=Math.max(1,...(overview?.dashboard?.errorsByClass||[]).map((v:any)=>Number(v.errors)));return <div key={item.error_class} className="mb-3"><div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">{item.error_class}</span><span className="text-slate-400">{fmt(item.errors)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-rose-400" style={{width:(Number(item.errors)/max*100)+'%'}}/></div></div>})}
          {!(overview?.dashboard?.errorsByClass||[]).length&&<p className="text-xs text-slate-500">No classified errors recorded for this period.</p>}
        </div>
      </div>
      <div className={panel}><h2 className="mb-3 font-bold text-white">Latency percentiles · 24h</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['p50','p95','p99'].map(key=><div key={key} className="rounded-xl bg-slate-900 p-3"><p className="text-xs uppercase text-slate-500">{key}</p><b className="text-xl text-white">{fmt(overview?.dashboard?.latency?.[key])} ms</b></div>)}
        <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Daily budget limit</p><b className="text-xl text-white">{Number(overview?.dashboard?.dailyCostThresholdUsd||0)>0?'$'+Number(overview.dashboard.dailyCostThresholdUsd).toFixed(2):'Not set'}</b></div>
      </div></div>
      <div className={panel}><h2 className="mb-3 font-bold text-white">Platform snapshot</h2><div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div><span className="text-slate-400">Registered users</span><p className="text-lg font-bold text-white">{fmt(overview?.users?.total)}</p></div>
        <div><span className="text-slate-400">Suspended accounts</span><p className="text-lg font-bold text-white">{fmt(overview?.users?.suspended)}</p></div>
        <div><span className="text-slate-400">Database size</span><p className="text-lg font-bold text-white">{overview?.storage?.database_bytes?fmt(Number(overview.storage.database_bytes)/1048576)+' MB':'—'}</p></div>
      </div></div>
    </div>}

    {tab==='users'&&<div className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">User management</h2><p className="text-xs text-slate-500">Suspend access, revoke sessions, and assign roles.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input className={field+' pl-9'} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email or user ID"/></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-slate-500"><tr>{['User','Role','Status','Last activity','Requests 30d','Actions'].map(x=><th key={x} className="border-b border-slate-800 px-3 py-3">{x}</th>)}</tr></thead><tbody>{filteredUsers.map(u=><tr key={u.id} className="border-b border-slate-900"><td className="px-3 py-3"><p className="font-semibold text-white">{u.display_name||u.email||'Unnamed user'}</p><p className="mt-1 text-[10px] text-slate-500">{u.email} · {u.id.slice(0,8)}</p></td><td className="px-3 py-3 text-slate-300">{u.role}</td><td className="px-3 py-3"><span className={u.status==='active'?'text-emerald-300':'text-amber-300'}>{u.status}</span></td><td className="px-3 py-3 text-slate-400">{date(u.last_seen_at)}</td><td className="px-3 py-3 text-slate-300">{fmt(u.requests_30d)}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">
        <button className={secondary} onClick={()=>void openUserProfile(u)}>Profile</button>
        {u.id!==selectedUser?.id&&<button className={secondary} onClick={()=>void confirmUserChange(u,{status:u.status==='active'?'suspended':'active'})}>{u.status==='active'?'Suspend':'Reactivate'}</button>}
        {u.role!=='superadmin'&&<button className={secondary} onClick={()=>void confirmUserChange(u,{role:u.role==='admin'?'user':'admin'})}>{u.role==='admin'?'Demote':'Make admin'}</button>}
        {isSuperadmin&&u.role!=='superadmin'&&<button className={secondary} onClick={()=>void confirmUserChange(u,{role:'superadmin'})}>Make superadmin</button>}
        {isSuperadmin&&u.status!=='deleted'&&<button className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300" onClick={()=>void confirmUserChange(u,{status:'deleted'})}>Soft delete</button>}
      </div></td></tr>)}</tbody></table>{!filteredUsers.length&&<p className="py-8 text-center text-sm text-slate-500">No users found.</p>}</div>
      {selectedUser&&<div className="mt-4 rounded-xl border border-cyan-500/30 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-white">User profile · {selectedUser.display_name||selectedUser.email}</h3><button className={secondary} onClick={()=>setSelectedUser(null)}>Close</button></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs text-slate-300">
          <p>Email: {selectedUser.email||'—'}</p><p>Role: {selectedUser.role}</p><p>Status: {selectedUser.status}</p>
          <p>Joined: {date(selectedUser.created_at)}</p><p>Last login: {date(selectedUser.last_login)}</p><p>Conversations: {fmt(selectedUser.conversationCount)}</p>
          <p>Input tokens: {fmt(selectedUser.usage?.input_tokens)}</p><p>Output tokens: {fmt(selectedUser.usage?.output_tokens)}</p><p>Total cost: ${fmt(selectedUser.usage?.total_cost)}</p>
        </div>
      </div>}
    </div>}

    {tab==='providers'&&<div className="space-y-4">
      <div className={panel}><h2 className="text-lg font-bold text-white">Add custom provider</h2>
        <p className="mb-3 text-xs text-slate-500">Register any OpenAI-compatible API endpoint. It starts disabled; configure its key, test it, discover models, then enable it.</p>
        <div className="grid gap-2 md:grid-cols-3">
          <input className={field} value={customSlug} onChange={e=>setCustomSlug(e.target.value)} placeholder="provider-slug (e.g. my-ai)"/>
          <input className={field} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Display name"/>
          <input className={field} value={customBaseUrl} onChange={e=>setCustomBaseUrl(e.target.value)} placeholder="https://api.example.com/v1"/>
        </div>
        <button className={primary+' mt-3'} disabled={!customSlug.trim()||!customName.trim()||!customBaseUrl.trim()} onClick={()=>void createCustomProvider()}>Register custom provider</button>
      </div>
      <div className={panel}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Provider control</h2><p className="text-xs text-slate-500">Provider keys stay encrypted on the server. They are never returned to this page.</p></div></div>
        <div className="grid gap-3 md:grid-cols-2">{providers.map(p=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-white">{p.displayName}</h3><p className="mt-1 text-xs text-slate-500">{p.id} · {p.kind||'provider'}</p></div>
            <span className={p.last_health_ok===true?'text-emerald-300':p.last_health_ok===false?'text-red-300':p.configured?'text-cyan-300':'text-amber-300'}>{p.last_health_ok===true?'Healthy':p.last_health_ok===false?'Health error':p.configured?'Configured':'Missing credentials'}</span></div>
          <p className="mt-2 text-[11px] text-slate-500">Last health check: {date(p.last_health_at)} {p.keyStatus?'· Key '+p.keyStatus:''} {isSuperadmin&&p.keyHint?'· key …'+p.keyHint:''}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={secondary+' flex items-center gap-2'} onClick={()=>void testProvider(p)}><Play className="h-3.5 w-3.5"/>Test connection</button>
            <button className={secondary+' flex items-center gap-2'} onClick={()=>void discoverProvider(p)}><RefreshCw className="h-3.5 w-3.5"/>Discover models</button>
            <button className={secondary+' flex items-center gap-2'} onClick={()=>void api('/api/admin/providers',{method:'PATCH',body:JSON.stringify({providerId:p.id,enabled:!p.enabled})}).then(loadAdminData).catch(e=>setError(e.message))}><Power className="h-3.5 w-3.5"/>{p.enabled?'Disable':'Enable'}</button>
          </div>
          {isSuperadmin&&p.kind!=='cloudflare'&&p.kind!=='ollama'&&<div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <label className="mb-2 block text-[11px] text-slate-400">Provider API key · saved value is never displayed</label>
            <input className={field} type="password" autoComplete="new-password" value={providerSecrets[p.id]||''} onChange={e=>setProviderSecrets(current=>({...current,[p.id]:e.target.value}))} placeholder="Paste new API key"/>
            <div className="mt-2 flex gap-2"><button className={secondary} onClick={()=>void saveProviderKey(p,false)}>Save key</button><button className={secondary} onClick={()=>void saveProviderKey(p,true)}>Rotate key</button></div>
          </div>}
        </div>)}</div>
      </div>
    </div>}

    {tab==='models'&&<div className="space-y-4">
      <div className={panel}><h2 className="mb-2 text-lg font-bold text-white">Manual model registration</h2><p className="mb-3 text-xs text-slate-500">Use an exact upstream model ID when discovery is unavailable. Manual entries are always disabled and unverified until a real provider inference check succeeds.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select className={field} value={manualProviderId} onChange={e=>setManualProviderId(e.target.value)}>{providers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select>
          <input className={field} value={manualModelId} onChange={e=>setManualModelId(e.target.value)} placeholder="Exact model ID"/>
          <input className={field} value={manualModelName} onChange={e=>setManualModelName(e.target.value)} placeholder="Display name (optional)"/>
          <input className={field} type="number" value={manualContext} onChange={e=>setManualContext(e.target.value)} placeholder="Context window (optional)"/>
        </div><button className={primary+' mt-3'} disabled={!manualProviderId||!manualModelId.trim()} onClick={()=>void addManualModel()}>Register model</button>
      </div>
      <div className={panel}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Model catalogue</h2><p className="text-xs text-slate-500">Only models with a recent successful health check can be selected by users.</p></div><button className={primary} onClick={()=>void discoverModels()}>Refresh verified inventory</button></div>
      <div className="space-y-3">{models.map(m=><div key={m.providerId+':'+m.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-white">{m.displayName}</p><p className="text-[10px] text-slate-500">{m.providerId} · {m.id} · {fmt(m.contextWindow)} context</p></div><div className="flex flex-wrap gap-2">
          <span className={m.verifiedAt?'text-emerald-300':'text-amber-300'}>{m.verifiedAt?'Verified':'Unverified'}</span>
          <button className={m.enabled?primary:secondary} onClick={()=>void patchModel(m,{enabled:!m.enabled})}>{m.enabled?'Enabled':'Disabled'}</button>
          <button className={secondary} onClick={()=>void testModel(m)}>Test</button>
          <button className={secondary} onClick={()=>void deleteModel(m)}>Delete</button>
        </div></div>
        <div className="mt-3 flex flex-wrap gap-2">{CAPABILITIES.map(cap=><label key={cap} className="flex items-center gap-1 rounded-lg border border-slate-800 px-2 py-1 text-[10px] text-slate-300"><input type="checkbox" checked={Boolean(m.capabilities?.[cap])} onChange={e=>{const next={...m.capabilities,[cap]:e.target.checked};void patchModel(m,{capabilities:Object.keys(next).filter(k=>next[k])});}}/>{cap}</label>)}</div>
        <p className="mt-2 text-[10px] text-slate-500">{m.verifiedAt?'Health verified '+date(m.verifiedAt):'Not currently verified'} · {m.lastHealthOk?'Last probe successful':'Last probe not successful'}</p>
      </div>)}</div>{!models.length&&<p className="text-sm text-slate-500">No registered models.</p>}</div>
      <div className={panel}><h2 className="font-bold text-white">Default routing / fallback order</h2><p className="my-2 text-xs text-slate-500">One providerId::modelId per line. First healthy eligible model is preferred.</p><select className={field+' mb-3'} value={fallbackCapability} onChange={e=>setFallbackCapability(e.target.value)}>{['text','vision','imageGen','tts','stt'].map(x=><option key={x}>{x}</option>)}</select><textarea className={field+' font-mono'} rows={5} value={fallbackText} onChange={e=>setFallbackText(e.target.value)}/><button className={primary+' mt-3 flex items-center gap-2'} onClick={()=>void saveFallback()}><Save className="h-4 w-4"/>Save routing order</button></div>
    </div>}

    {tab==='usage'&&<div className="space-y-4">
      <div className={panel}><h2 className="mb-3 text-lg font-bold text-white">AI usage records</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Requests</p><b className="text-xl text-white">{fmt(usageSummary?.requests)}</b></div>
          <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Input tokens</p><b className="text-xl text-white">{fmt(usageSummary?.input_tokens)}</b></div>
          <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Output tokens</p><b className="text-xl text-white">{fmt(usageSummary?.output_tokens)}</b></div>
          <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Cost · USD</p><b className="text-xl text-white">${Number(usageSummary?.cost_usd||0).toFixed(4)}</b></div>
          <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Avg latency</p><b className="text-xl text-white">{fmt(usageSummary?.avg_latency_ms)} ms</b></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input className={field} type="datetime-local" value={usageFrom} onChange={e=>setUsageFrom(e.target.value)}/>
          <input className={field} type="datetime-local" value={usageTo} onChange={e=>setUsageTo(e.target.value)}/>
          <select className={field} value={usageProvider} onChange={e=>setUsageProvider(e.target.value)}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select>
          <input className={field} value={usageModel} onChange={e=>setUsageModel(e.target.value)} placeholder="Exact model ID"/>
        </div>
        <button className={primary+' mt-3'} onClick={()=>void loadUsage()}>Apply usage filters</button>
      </div>
      <div className={panel}><h3 className="mb-3 font-bold text-white">Usage detail</h3><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="text-slate-500"><tr>{['Time','User','Provider','Model','Input','Output','Cost','Latency','Status'].map(x=><th key={x} className="border-b border-slate-800 p-3">{x}</th>)}</tr></thead><tbody>{usageRecords.map((row:any)=><tr key={row.id} className="border-b border-slate-900 text-slate-300"><td className="p-3">{date(row.created_at)}</td><td className="p-3">{row.user_id||'Guest'}</td><td className="p-3">{row.provider_key||'—'}</td><td className="p-3 font-mono">{row.model_key||row.model_id||'—'}</td><td className="p-3">{fmt(row.tokens_in)}</td><td className="p-3">{fmt(row.tokens_out)}</td><td className="p-3">${Number(row.cost_usd||0).toFixed(5)}</td><td className="p-3">{fmt(row.latency_ms)} ms</td><td className="p-3">{row.status}</td></tr>)}</tbody></table>{!usageRecords.length&&<p className="py-6 text-center text-xs text-slate-500">No usage records match these filters.</p>}</div></div>
    </div>}

    {tab==='errors'&&<div className="space-y-4"><div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Error monitoring</h2><p className="text-xs text-slate-500">Redacted messages, request IDs and safe metadata only.</p></div><button className={secondary} onClick={exportErrors}>Export CSV</button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className={field} type="datetime-local" value={errorFrom} onChange={e=>setErrorFrom(e.target.value)}/>
        <input className={field} type="datetime-local" value={errorTo} onChange={e=>setErrorTo(e.target.value)}/>
        <select className={field} value={errorClass} onChange={e=>setErrorClass(e.target.value)}><option value="">All error classes</option>{['network','auth','rate_limit','provider_5xx','invalid_request','content_policy','timeout','unavailable','unknown'].map(x=><option key={x}>{x}</option>)}</select>
        <input className={field} value={errorModel} onChange={e=>setErrorModel(e.target.value)} placeholder="Model ID"/>
      </div><button className={primary+' mt-3'} onClick={()=>void loadErrors()}>Apply error filters</button>
      </div>
      <div className={panel}><div className="space-y-2">{errorRows.map((row:any)=><div key={row.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-xs text-rose-300">{row.error_class} · {row.error_code}</b><span className="text-[10px] text-slate-500">{date(row.created_at)}</span></div>
        <p className="mt-1 break-all font-mono text-[10px] text-cyan-200">Request: {row.request_id}</p>
        <p className="mt-2 text-xs text-slate-300">{row.message_redacted}</p>
        <p className="mt-1 text-[10px] text-slate-500">{row.provider_key||'—'} · {row.model_id||'—'} · {row.user_id||'Guest'}</p>
      </div>)}{!errorRows.length&&<p className="py-6 text-center text-xs text-slate-500">No error records match these filters.</p>}</div></div>
    </div>}

    {tab==='limits'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Rate-limit policy</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select className={field} value={rateScope} onChange={e=>setRateScope(e.target.value)}><option value="user">Per user</option><option value="tier">Per tier</option><option value="model">Per model</option></select><input className={field} value={rateKey} onChange={e=>setRateKey(e.target.value)} placeholder="User ID / role (user/admin) / model ID"/><input className={field} type="number" min="1" value={rateRequests} onChange={e=>setRateRequests(e.target.value)} placeholder="Requests"/><input className={field} type="number" min="1" value={rateWindow} onChange={e=>setRateWindow(e.target.value)} placeholder="Window seconds"/></div><button className={primary+' mt-3'} onClick={()=>void saveRate()}>Save policy</button><p className="mt-2 text-xs text-slate-500">User and role-based limits are enforced by the API gateway. Model limits are enforced when the client sends its selected model header.</p></div><div className={panel}><h3 className="mb-3 font-bold text-white">Configured policies</h3><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs"><thead className="text-slate-500"><tr>{['Scope','Key','Limit','Window','Status'].map(x=><th key={x} className="border-b border-slate-800 p-3">{x}</th>)}</tr></thead><tbody>{policies.map(p=><tr key={p.id} className="border-b border-slate-900 text-slate-300"><td className="p-3">{p.scope_type}</td><td className="p-3">{p.scope_key}</td><td className="p-3">{p.requests} requests</td><td className="p-3">{p.window_seconds}s</td><td className="p-3">{p.enabled?'Enabled':'Disabled'}</td></tr>)}</tbody></table></div></div></div>}

    {tab==='health'&&<div className="space-y-4"><div className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">System health</h2><p className="text-xs text-slate-500">Live database and provider checks. Queue state is reported honestly when not configured.</p></div><button className={primary} onClick={()=>void loadHealth()}>Run health check</button></div>{health&&<div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2 text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300"/>Database</div><p className="mt-2 text-sm text-slate-300">{health.database?.healthy?'Healthy':'Unavailable'} · {fmt(health.database?.latencyMs)} ms</p></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2 text-white"><Activity className="h-4 w-4 text-cyan-300"/>Queues</div><p className="mt-2 text-sm text-slate-300">{health.queues?.status||'Unknown'}</p></div>{(health.providers||[]).map((p:any)=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><p className="font-semibold text-white">{p.id}</p><p className={p.healthy?'text-emerald-300':'text-amber-300'}>{p.healthy?'Healthy':'Unavailable'} · {p.latencyMs==null?'—':p.latencyMs+' ms'}</p></div>)}</div>}</div><div className={panel}><h3 className="mb-3 font-bold text-white">Storage usage</h3><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">PostgreSQL database</p><b className="text-xl text-white">{overview?.storage?.database_bytes? new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(overview.storage.database_bytes)/1048576)+' MB':'—'}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Generated asset records</p><b className="text-xl text-white">{fmt(overview?.storage?.asset_records)}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Conversations</p><b className="text-xl text-white">{fmt(overview?.storage?.conversations)}</b></div></div><p className="mt-3 text-xs text-slate-500">R2: {overview?.storage?.r2Configured?'Configured':'Not configured / unknown'} · KV: {overview?.storage?.kvConfigured?'Configured':'Not configured / unknown'}. External bucket byte usage is not available through the current adapter.</p></div></div>}

    {tab==='config'&&<div className="space-y-4">
      <div className={panel}><h2 className="text-lg font-bold text-white">System configuration</h2><p className="mb-3 text-xs text-slate-500">Values are stored in PostgreSQL and each change is audited. Do not store API secrets here.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={field} value={configKey} onChange={e=>setConfigKey(e.target.value)} placeholder="Configuration key"/>
          <input className={field} value={configValue} onChange={e=>setConfigValue(e.target.value)} placeholder="JSON value or string"/>
          <button className={primary} onClick={()=>void saveSystemConfig()}>Save configuration</button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Example: daily_cost_threshold_usd = 25</p>
      </div>
      <div className={panel}><h3 className="mb-3 font-bold text-white">Stored configuration</h3>
        <div className="space-y-2">{systemConfig.map((item:any)=><div key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><b className="text-xs text-cyan-200">{item.key}</b><p className="mt-1 break-all text-[11px] text-slate-300">{JSON.stringify(item.value_json)}</p></div><button className={secondary} onClick={()=>{setConfigKey(item.key);setConfigValue(JSON.stringify(item.value_json));}}>Edit</button></div>)}{!systemConfig.length&&<p className="text-xs text-slate-500">No configuration values have been saved.</p>}</div>
      </div>
    </div>}

    {tab==='flags'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Feature flags</h2><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className={field} value={newFlag} onChange={e=>setNewFlag(e.target.value)} placeholder="feature.key"/><input className={field} value={newFlagDescription} onChange={e=>setNewFlagDescription(e.target.value)} placeholder="Description"/><button className={primary+' flex items-center justify-center gap-2'} onClick={()=>void createFlag()}><Plus className="h-4 w-4"/>Add flag</button></div><div className="mt-4 space-y-2">{flags.map(flag=><div key={flag.flag_key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><p className="font-semibold text-white">{flag.flag_key}</p><p className="text-xs text-slate-500">{flag.description}</p></div><button className={flag.enabled?primary:secondary} onClick={()=>void toggleFlag(flag)}>{flag.enabled?'Enabled':'Disabled'}</button></div>)}</div></div><div className={panel}><h2 className="mb-2 font-bold text-white">Publish announcement</h2><p className="mb-3 text-xs text-slate-500">Persists the announcement and sends in-app notifications to users who opted into product updates.</p><input className={field+' mb-2'} value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} maxLength={120} placeholder="Announcement title"/><textarea className={field} rows={4} value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} maxLength={2000} placeholder="Announcement message"/><button className={primary+' mt-3'} disabled={!announcementTitle.trim()||!announcementBody.trim()} onClick={()=>void sendAnnouncement()}>Publish and notify</button><div className="mt-4 space-y-2">{announcements.map((item:any)=><div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3"><b className="text-sm text-white">{item.title}</b><p className="mt-1 text-xs text-slate-300">{item.body}</p><p className="mt-1 text-[10px] text-slate-500">{date(item.created_at)} · {item.enabled?'Published':'Disabled'}</p></div>)}</div></div></div>}

    {tab==='audit'&&<div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Immutable audit log</h2><p className="mb-4 text-xs text-slate-500">Append-only database trigger prevents UPDATE and DELETE operations.</p><div className="space-y-2">{audit.map(a=><div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-xs text-cyan-200">{a.action}</b><span className="text-[10px] text-slate-500">{date(a.created_at)}</span></div><p className="mt-1 text-xs text-slate-300">{a.actor_email||'System'} · {a.target_type||'—'} / {a.target_id||'—'}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(a.metadata)}</pre></div>)}{!audit.length&&<p className="text-sm text-slate-500">No audit events yet.</p>}</div></div>}

    {tab==='security'&&<div className="space-y-4">
      <div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Active sessions</h2><p className="mb-4 text-xs text-slate-500">Sessions expose metadata only; the session token is never returned.</p>
        <div className="space-y-2">{sessions.map((session:any)=><div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><b className="text-xs text-white">{session.email}</b><p className="mt-1 text-[10px] text-slate-400">{session.user_agent||'Unknown device'} · IP {session.ip||'—'}</p><p className="mt-1 text-[10px] text-slate-500">Last seen {date(session.last_seen_at)} · Expires {date(session.expires_at)}</p></div><button className="rounded-xl border border-red-500/40 px-3 py-2 text-xs text-red-300" onClick={()=>void revokeSession(session)}>Revoke session</button></div>)}{!sessions.length&&<p className="text-sm text-slate-500">No active sessions found.</p>}</div>
      </div>
      <div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Security events feed</h2><p className="mb-4 text-xs text-slate-500">Authentication denials and API server failures. Sensitive credential values are excluded.</p><div className="space-y-2">{security.map(e=><div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={e.severity==='critical'?'text-red-300':e.severity==='warning'?'text-amber-300':'text-cyan-300'}><ShieldAlert className="h-4 w-4"/></span><b className="text-sm text-white">{e.event_type}</b></div><span className="text-[10px] text-slate-500">{date(e.created_at)}</span></div><p className="mt-1 text-[10px] text-slate-400">Severity: {e.severity} · User: {e.user_id||'unknown'} · Request: {e.request_id||'—'}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(e.metadata)}</pre></div>)}{!security.length&&<p className="text-sm text-slate-500">No security events recorded.</p>}</div></div>
    </div>}
  </section>;
};

const RequestTable:React.FC<{rows:RequestRow[];language:Language}> = ({rows,language}) => <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-slate-500"><tr>{['Request ID','Route','Status','Duration','Classified','Time'].map(x=><th key={x} className="border-b border-slate-800 p-2">{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.request_id+i} className="border-b border-slate-900"><td className="p-2 font-mono text-cyan-200">{r.request_id}</td><td className="p-2 text-slate-300">{r.method} {r.route}</td><td className="p-2 text-slate-300">{r.status_code}</td><td className="p-2 text-slate-300">{r.duration_ms} ms</td><td className="p-2 text-slate-400">{r.classification}</td><td className="p-2 text-slate-500">{new Intl.DateTimeFormat(getIntlLocale(language),{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.created_at))}</td></tr>)}</tbody></table>{!rows.length&&<p className="py-5 text-center text-xs text-slate-500">No request telemetry recorded yet.</p>}</div>;
