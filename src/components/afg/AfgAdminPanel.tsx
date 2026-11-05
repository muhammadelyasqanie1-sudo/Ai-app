import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, LockKeyhole, RefreshCw, LogOut, LayoutDashboard, Users, Network, TerminalSquare,
  Cpu, Activity, Gauge, HardDrive, Flag, ClipboardList, ShieldAlert, CheckCircle2,
  Search, Play, Power, Save, Plus, AlertTriangle, Settings, FileWarning, KeyRound, PlugZap
} from 'lucide-react';
import { AfgConnectionsPanel } from './AfgConnectionsPanel.tsx';
import { AfgApiHubPanel } from './AfgApiHubPanel.tsx';
import { AfgMcpPanel } from './AfgMcpPanel.tsx';
import { AfgNineRouterPanel } from './AfgNineRouterPanel.tsx';
import { AfgOnlineAdminTerminal } from './AfgOnlineAdminTerminal.tsx';
import type { Language } from '../../types/afg';
import { getIntlLocale } from '../../utils/i18n';

interface AfgAdminPanelProps { language: Language; }
type Tab = 'overview'|'users'|'staff'|'providers'|'models'|'usage'|'errors'|'limits'|'health'|'config'|'flags'|'audit'|'security'|'connections'|'api-hub'|'mcp'|'9router'|'terminal';
type ProviderRow = {
  id:string; displayName:string; enabled:boolean; configured:boolean; kind?:string;
  base_url?:string|null; config_json?:Record<string,any>; keyHint?:string|null;
  keyStatus?:string|null; last_health_at?:string|null; last_health_ok?:boolean|null;
  source?:string; has_key?:boolean;
};
type ModelRow = {
  id:string; providerId:string; displayName:string; description?:string; contextWindow:number;
  maxOutput?:number|null; enabled:boolean; verifiedAt:string|null; lastHealthOk?:boolean;
  discoveredAt?:string|null; capabilities:Record<string,boolean>;
  inputCostPerMillion:number|null; outputCostPerMillion:number|null; pricing?:any; requiredTier?:string;
};
type UserRow = {
  id:string; email:string|null; display_name:string|null; role:string; status:string;
  created_at:string; last_seen_at:string|null; requests_30d:number;
};
type RatePolicy = { id:string; scope_type:string; scope_key:string; requests:number; window_seconds:number; enabled:boolean };
type RequestRow = { request_id:string; method:string; route:string; status_code:number; duration_ms:number; classification:string; created_at:string };
type Overview = { usage:any[]; requests:any; users:any; storage:any; dashboard?:any };
const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const NAV: {id:Tab;labelEn:string;labelFa:string;icon:any}[] = [
  {id:'overview',labelEn:'Dashboard',labelFa:'نمای کلی',icon:LayoutDashboard},
  {id:'users',labelEn:'Users',labelFa:'کاربران',icon:Users},
  {id:'staff',labelEn:'Staff & Permissions',labelFa:'کارکنان و دسترسی‌ها',icon:ShieldCheck},
  {id:'providers',labelEn:'Providers',labelFa:'ارائه‌دهندگان',icon:Network},
  {id:'models',labelEn:'Models',labelFa:'مدل‌ها',icon:Cpu},
  {id:'usage',labelEn:'Usage',labelFa:'مصرف',icon:Activity},
  {id:'errors',labelEn:'Errors',labelFa:'خطاها',icon:FileWarning},
  {id:'limits',labelEn:'Rate Limits',labelFa:'محدودیت درخواست',icon:Gauge},
  {id:'security',labelEn:'Security',labelFa:'امنیت',icon:ShieldAlert},
  {id:'audit',labelEn:'Audit Log',labelFa:'گزارش رویدادها',icon:ClipboardList},
  {id:'config',labelEn:'Configuration',labelFa:'تنظیمات',icon:Settings},
  {id:'flags',labelEn:'Flags & Announcements',labelFa:'امکانات و اطلاعیه‌ها',icon:Flag},
  {id:'health',labelEn:'System Health',labelFa:'سلامت سیستم',icon:HardDrive},
  {id:'connections',labelEn:'Connections',labelFa:'اتصال‌ها و یکپارچه‌سازی',icon:PlugZap},
  {id:'api-hub',labelEn:'Universal API Hub',labelFa:'مرکز جامع APIها',icon:Network},
  {id:'mcp',labelEn:'MCP Tools & Servers',labelFa:'ابزارها و سرورهای MCP',icon:PlugZap},
  {id:'9router',labelEn:'9Router AI Gateway',labelFa:'درگاه هوش مصنوعی 9Router',icon:Activity},
  {id:'terminal',labelEn:'Online Admin Terminal',labelFa:'ترمینال مدیر آنلاین',icon:TerminalSquare},
];
const CAPABILITIES = ['text','streaming','vision','imageGen','imageEdit','ocr','tts','stt','tools','jsonMode'];
const STAFF_PERMISSIONS = ['providers:read','providers:manage','models:read','models:manage','routing:read','routing:manage','users:read','users:manage','users:suspend','audit:read','security:read','security:manage','dashboard:read','usage:read','system:read','settings:read','settings:manage','subscriptions:read','subscriptions:manage','notifications:broadcast'];

function csrfCookie(): string {
  const match = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='));
  return match ? decodeURIComponent(match.slice('afg_csrf='.length)) : '';
}

async function adminApi(path:string, options:RequestInit = {}):Promise<any> {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type','application/json');
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-CSRF-Token',csrfCookie());
  const response = await fetch(API + path,{...options,headers,credentials:'include',cache:'no-store'});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const failure = new Error(body.error || ('HTTP ' + response.status)) as Error & {status?:number; retryAfter?:string};
    failure.status = response.status;
    failure.retryAfter = response.headers.get('Retry-After') || undefined;
    throw failure;
  }
  return body;
}

export const AfgAdminPanel: React.FC<AfgAdminPanelProps> = ({language}) => {
  const dari = language === 'dari';
  const locale = getIntlLocale(language);
  const fmt = (value:any) => value == null ? '—' : new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Number(value));
  const money = (value:any, places=4) => value == null ? 'Unknown' : '$' + Number(value).toFixed(places);
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
  const [models,setModels] = useState<ModelRow[]>([]);
  const [users,setUsers] = useState<UserRow[]>([]);
  const [staffRoles,setStaffRoles] = useState<any[]>([]);
  const [overview,setOverview] = useState<Overview|null>(null);
  const [requests,setRequests] = useState<RequestRow[]>([]);
  const [security,setSecurity] = useState<any[]>([]);
  const [audit,setAudit] = useState<any[]>([]);
  const [policies,setPolicies] = useState<RatePolicy[]>([]);
  const [flags,setFlags] = useState<any[]>([]);
  const [health,setHealth] = useState<any|null>(null);
  const [fallbacks,setFallbacks] = useState<any[]>([]);
  const [usageRecords,setUsageRecords] = useState<any[]>([]);
  const [usageSummary,setUsageSummary] = useState<any|null>(null);
  const [errorRows,setErrorRows] = useState<any[]>([]);
  const [sessions,setSessions] = useState<any[]>([]);
  const [systemConfig,setSystemConfig] = useState<any[]>([]);
  const [announcements,setAnnouncements] = useState<any[]>([]);
  const [selectedUser,setSelectedUser] = useState<any|null>(null);

  const [providerSecrets,setProviderSecrets] = useState<Record<string,string>>({});
  const [providerBaseUrls,setProviderBaseUrls] = useState<Record<string,string>>({});
  const [customSlug,setCustomSlug] = useState('');
  const [customName,setCustomName] = useState('');
  const [customBaseUrl,setCustomBaseUrl] = useState('');
  const [customProtocol,setCustomProtocol] = useState<'openai-compatible'|'anthropic-messages'>('openai-compatible');

  const [manualProviderId,setManualProviderId] = useState('deepseek');
  const [manualModelId,setManualModelId] = useState('');
  const [manualModelName,setManualModelName] = useState('');
  const [manualContext,setManualContext] = useState('');
  const [modelSearch,setModelSearch] = useState('');
  const [modelProviderFilter,setModelProviderFilter] = useState('all');
  const [modelStatusFilter,setModelStatusFilter] = useState('all');
  const [modelPage,setModelPage] = useState(0);
  const [selectedModelKeys,setSelectedModelKeys] = useState<Set<string>>(new Set());
  const [bulkAction,setBulkAction] = useState<'enable'|'disable'|null>(null);

  const [search,setSearch] = useState('');
  const [userRoleFilter,setUserRoleFilter] = useState('all');
  const [userStatusFilter,setUserStatusFilter] = useState('all');
  const [userJoinedFrom,setUserJoinedFrom] = useState('');
  const [userJoinedTo,setUserJoinedTo] = useState('');
  const [userPage,setUserPage] = useState(0);

  const [usageFrom,setUsageFrom] = useState('');
  const [usageTo,setUsageTo] = useState('');
  const [usageProvider,setUsageProvider] = useState('');
  const [usageModel,setUsageModel] = useState('');
  const [errorFrom,setErrorFrom] = useState('');
  const [errorTo,setErrorTo] = useState('');
  const [errorClass,setErrorClass] = useState('');
  const [errorModel,setErrorModel] = useState('');
  const [auditFrom,setAuditFrom] = useState('');
  const [auditTo,setAuditTo] = useState('');
  const [auditActor,setAuditActor] = useState('');

  const [fallbackCapability,setFallbackCapability] = useState('text');
  const [fallbackText,setFallbackText] = useState('');
  const [newFlag,setNewFlag] = useState('');
  const [newFlagDescription,setNewFlagDescription] = useState('');
  const [rateScope,setRateScope] = useState('tier');
  const [rateKey,setRateKey] = useState('free');
  const [rateRequests,setRateRequests] = useState('60');
  const [rateWindow,setRateWindow] = useState('60');
  const [announcementTitle,setAnnouncementTitle] = useState('');
  const [announcementBody,setAnnouncementBody] = useState('');
  const [configKey,setConfigKey] = useState('daily_cost_threshold_usd');
  const [configValue,setConfigValue] = useState('25');

  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const adminLoadInFlight = useRef(false);

  const loadAdminData = useCallback(async():Promise<boolean>=>{
    if(adminLoadInFlight.current)return false;
    adminLoadInFlight.current=true;
    setLoading(true);
    setError('');
    try{
      const paths=[
        '/api/admin/providers','/api/admin/models','/api/admin/fallbacks','/api/admin/users',
        '/api/admin/overview','/api/admin/requests','/api/admin/security-events','/api/admin/audit',
        '/api/admin/rate-limits','/api/admin/feature-flags','/api/admin/usage','/api/admin/errors',
        '/api/admin/sessions','/api/admin/config','/api/admin/announcements',
      ];
      const values=await Promise.all(paths.map(path=>adminApi(path)));
      setProviders(values[0].providers||[]);
      setModels(values[1].models||[]);
      setFallbacks(values[2].fallbacks||[]);
      setUsers(values[3].users||[]);
      setOverview(values[4]);
      setRequests(values[5].requests||[]);
      setSecurity(values[6].events||[]);
      setAudit(values[7].events||[]);
      setPolicies(values[8].policies||[]);
      setFlags(values[9].flags||[]);
      setUsageRecords(values[10].records||[]);
      setUsageSummary(values[10].summary||null);
      setErrorRows(values[11].errors||[]);
      setSessions(values[12].sessions||[]);
      setSystemConfig(values[13].config||[]);
      setAnnouncements(values[14].announcements||[]);
      const staffData = await adminApi('/api/admin/staff/roles').catch(()=>({roles:[]}));
      setStaffRoles(staffData.roles||[]);
      setAuthenticated(true);
      return true;
    }catch(err){
      const status = (err as Error & {status?:number})?.status;
      // A rate limit, transient database error, or failed dashboard query must not sign the administrator out.
      if(status === 401){
        setAuthenticated(false);
        setAdminRole(null);
      }
      setError(err instanceof Error?err.message:'Could not load administrator data.');
      return false;
    }finally{adminLoadInFlight.current=false;setLoading(false);}
  },[]);

  const loadHealth = useCallback(async()=>{
    try{setHealth(await adminApi('/api/admin/system-health'));}
    catch(err){setError(err instanceof Error?err.message:'System health check failed.');}
  },[]);

  useEffect(()=>{
    adminApi('/api/auth/me').then((data)=>{
      if(data.authenticated && ['admin','superadmin'].includes(data.user?.role)){
        setAdminRole(data.user.role);
        setAuthenticated(true);
        void loadAdminData();
      }
    }).catch(()=>{});
  },[loadAdminData]);

  useEffect(()=>{
    const row=fallbacks.find(item=>item.capability===fallbackCapability);
    const value=Array.isArray(row?.ordered_models)?row.ordered_models:[];
    setFallbackText(value.join(String.fromCharCode(10)));
  },[fallbacks,fallbackCapability]);

  const signIn=async(bootstrap:boolean)=>{
    setLoading(true);setError('');setNotice('');
    try{
      await adminApi(bootstrap?'/api/auth/bootstrap-admin':'/api/auth/login',{method:'POST',body:JSON.stringify(
        bootstrap?{email,password,displayName,bootstrapToken}:{email,password}
      )});
      setBootstrapToken('');
      const session=await adminApi('/api/auth/me');
      if(session.user?.role==='admin'||session.user?.role==='superadmin'){
        setAdminRole(session.user.role);
        setAuthenticated(true);
      }else{
        throw new Error('The account is not an administrator.');
      }
      if(await loadAdminData())setNotice('Administrator session established.');
    }catch(err){setError(err instanceof Error?err.message:'Administrator authentication failed.');}
    finally{setLoading(false);}
  };

  const signOut=async()=>{
    try{await adminApi('/api/auth/logout',{method:'POST',body:'{}'});}catch{}
    setAuthenticated(false);setAdminRole(null);setProviders([]);setModels([]);setUsers([]);
  };

  const reloadNotice=async(message:string)=>{
    if(await loadAdminData())setNotice(message);
  };

  const patchUser=async(user:UserRow,patch:Record<string,string>)=>{
    try{
      await adminApi('/api/admin/users',{method:'PATCH',body:JSON.stringify({userId:user.id,...patch})});
      await reloadNotice('User access updated.');
    }catch(err){setError(err instanceof Error?err.message:'User update failed.');}
  };

  const saveStaffRole=async(role:any)=>{
    setError('');
    try{
      await adminApi('/api/admin/staff/roles',{method:'PATCH',body:JSON.stringify({role:role.name,permissions:role.permissions_json||{}})});
      await reloadNotice('Staff permissions saved.');
    }catch(err){setError(err instanceof Error?err.message:'Could not save staff permissions.');}
  };

  const confirmUserChange=async(user:UserRow,patch:Record<string,string>)=>{
    const identity=user.email||user.display_name||user.id;
    const entered=window.prompt('Confirm this sensitive change by typing exactly: '+identity);
    if(entered!==identity){setError('Confirmation did not match. No change was made.');return;}
    if(patch.status==='deleted'){
      const currentPassword=window.prompt('Re-authenticate: enter your current administrator password.');
      if(!currentPassword){setError('Password confirmation is required.');return;}
      try{
        await adminApi('/api/admin/users',{method:'PATCH',body:JSON.stringify({userId:user.id,...patch,currentPassword})});
        await reloadNotice('Account soft-deleted.');
      }catch(err){setError(err instanceof Error?err.message:'Account deletion failed.');}
      return;
    }
    await patchUser(user,patch);
  };

  const openUserProfile=async(user:UserRow)=>{
    try{
      const result=await adminApi('/api/admin/users/'+encodeURIComponent(user.id));
      setSelectedUser(result.user||null);
    }catch(err){setError(err instanceof Error?err.message:'Could not load user profile.');}
  };

  const sendPasswordReset=async(user:UserRow)=>{
    const identity=user.email||user.id;
    const entered=window.prompt('Send a password reset email to '+identity+'? Type the email to confirm.');
    if(entered!==identity){setError('Confirmation did not match.');return;}
    try{
      const result=await adminApi('/api/admin/users/'+encodeURIComponent(user.id)+'/password-reset',{method:'POST',body:'{}'});
      setNotice(result.message||'Password reset request processed.');
    }catch(err){setError(err instanceof Error?err.message:'Password reset could not be sent.');}
  };

  const testProvider=async(provider:ProviderRow)=>{
    setNotice('Testing '+provider.displayName+'...');
    try{
      const result=await adminApi('/api/admin/providers/'+encodeURIComponent(provider.id)+'/test',{method:'POST',body:'{}'});
      setNotice(result.connected?provider.displayName+' inference probe succeeded.':provider.displayName+' inference probe failed.');
      await loadAdminData();
    }catch(err){setError(err instanceof Error?err.message:'Provider test failed.');}
  };

  const discoverProvider=async(provider:ProviderRow)=>{
    setError('');setNotice('Discovering models from '+provider.displayName+'...');
    try{
      const result=await adminApi('/api/admin/providers/'+encodeURIComponent(provider.id)+'/discover-models',{method:'POST',body:'{}'});
      await loadAdminData();
      setNotice(provider.displayName+': discovered '+result.discovered+' models. New entries remain disabled.');
    }catch(err){setError(err instanceof Error?err.message:'Provider model discovery failed.');}
  };

  const toggleProvider=async(provider:ProviderRow)=>{
    try{
      await adminApi('/api/admin/providers',{method:'PATCH',body:JSON.stringify({providerId:provider.id,enabled:!provider.enabled})});
      await reloadNotice(provider.displayName+(provider.enabled?' disabled.':' enabled.'));
    }catch(err){setError(err instanceof Error?err.message:'Provider status update failed.');}
  };

  const saveProviderConfig=async(provider:ProviderRow)=>{
    const baseUrl=(providerBaseUrls[provider.id]??provider.base_url??'').trim();
    if(!baseUrl){setError('Enter a provider base URL.');return;}
    if(!isSuperadmin){setError('Only superadmin can change provider configuration.');return;}
    try{
      await adminApi('/api/admin/providers/'+encodeURIComponent(provider.id)+'/config',{method:'PATCH',
        body:JSON.stringify({baseUrl,protocol:provider.config_json?.protocol||'openai-compatible'})});
      setProviderBaseUrls(current=>({...current,[provider.id]:''}));
      await reloadNotice(provider.displayName+' configuration updated; verification cache cleared.');
    }catch(err){setError(err instanceof Error?err.message:'Provider configuration could not be saved.');}
  };

  const saveProviderKey=async(provider:ProviderRow,rotate=false)=>{
    const apiKey=(providerSecrets[provider.id]||'').trim();
    if(!apiKey){setError('Enter the provider API key first.');return;}
    if(!isSuperadmin){setError('Only superadmin can manage provider keys.');return;}
    const currentPassword=window.prompt('Re-authenticate: enter your current administrator password.');
    if(!currentPassword){setError('Password confirmation is required.');return;}
    try{
      const route='/api/admin/providers/'+encodeURIComponent(provider.id)+'/keys'+(rotate?'/rotate':'');
      await adminApi(route,{method:rotate?'POST':'PUT',body:JSON.stringify({apiKey,alias:'default',currentPassword})});
      setProviderSecrets(current=>({...current,[provider.id]:''}));
      await reloadNotice(provider.displayName+' key securely saved.');
    }catch(err){setError(err instanceof Error?err.message:'Provider key could not be saved.');}
  };

  const createCustomProvider=async()=>{
    try{
      const result=await adminApi('/api/admin/providers/custom',{method:'POST',body:JSON.stringify({
        slug:customSlug,displayName:customName,baseUrl:customBaseUrl,protocol:customProtocol
      })});
      setCustomSlug('');setCustomName('');setCustomBaseUrl('');
      await loadAdminData();
      setNotice('Custom provider '+result.provider.slug+' created. Add its key in the provider card.');
    }catch(err){setError(err instanceof Error?err.message:'Custom provider could not be created.');}
  };

  const patchModel=async(model:ModelRow,patch:Record<string,any>)=>{
    try{
      await adminApi('/api/admin/models',{method:'PATCH',body:JSON.stringify({
        providerId:model.providerId,modelId:model.id,enabled:model.enabled,
        inputCostPerMillion:model.inputCostPerMillion,outputCostPerMillion:model.outputCostPerMillion,...patch
      })});
      await reloadNotice('Model settings saved.');
    }catch(err){setError(err instanceof Error?err.message:'Model update failed.');}
  };

  const modelKey=(model:ModelRow)=>model.providerId+'::'+model.id;
  const toggleModelSelection=(model:ModelRow)=>{
    const key=modelKey(model);
    setSelectedModelKeys(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next;});
  };
  const selectFilteredModels=()=>{
    if(filteredModels.length>1000){setError('Select up to 1,000 filtered models at a time. Narrow the filters to continue.');return;}
    setSelectedModelKeys(new Set(filteredModels.map(modelKey)));
  };
  const bulkSetModels=async(enabled:boolean)=>{
    if(bulkAction)return;
    const chosen=models.filter(model=>selectedModelKeys.has(modelKey(model)));
    if(!chosen.length){setError('Select at least one model first.');return;}
    setError('');
    setNotice((enabled?'Enabling ':'Disabling ')+chosen.length+' selected models…');
    setBulkAction(enabled?'enable':'disable');
    try{
      const result=await adminApi('/api/admin/models/bulk',{method:'POST',body:JSON.stringify({
        enabled,models:chosen.map(model=>({providerId:model.providerId,modelId:model.id}))
      })});
      setSelectedModelKeys(new Set());
      const refreshed=await loadAdminData();
      if(refreshed){
        const summary=(enabled?'Enabled ':'Disabled ')+String(result.changed||0)+' models; '+
          String(result.unchanged||0)+' already had that state; '+String(result.missing||0)+' were not found.';
        setNotice(summary);
      }else{
        setNotice('The bulk update completed, but the model list could not refresh. Use Refresh to confirm the latest state.');
      }
    }catch(err){
      const status=(err as Error & {status?:number})?.status;
      const retry=(err as Error & {retryAfter?:string})?.retryAfter;
      setError((err instanceof Error?err.message:'Bulk model update failed.')+
        (status===429?' Please wait '+(retry||'a short time')+' and retry.':''));
      setNotice('');
    }finally{setBulkAction(null);}
  };

  const testModel=async(model:ModelRow)=>{
    try{
      const result=await adminApi('/api/admin/models/test',{method:'POST',body:JSON.stringify({providerId:model.providerId,modelId:model.id})});
      await loadAdminData();
      setNotice(result.healthy?model.id+' verification succeeded.':model.id+' verification failed.');
    }catch(err){setError(err instanceof Error?err.message:'Model health check failed.');}
  };

  const deleteModel=async(model:ModelRow)=>{
    const confirmation=window.prompt('To permanently remove this model from the catalogue, type its exact ID: '+model.id);
    if(confirmation!==model.id){setError('Model ID confirmation did not match. No deletion was performed.');return;}
    try{
      await adminApi('/api/admin/models',{method:'DELETE',body:JSON.stringify({providerId:model.providerId,modelId:model.id})});
      await reloadNotice('Model deleted from catalogue.');
    }catch(err){setError(err instanceof Error?err.message:'Model deletion failed.');}
  };

  const addManualModel=async()=>{
    try{
      await adminApi('/api/admin/models/manual',{method:'POST',body:JSON.stringify({
        providerId:manualProviderId,modelId:manualModelId,displayName:manualModelName,
        contextWindow:manualContext?Number(manualContext):0
      })});
      setManualModelId('');setManualModelName('');setManualContext('');
      await reloadNotice('Model registered disabled and unverified. Run its health check after configuring the provider.');
    }catch(err){setError(err instanceof Error?err.message:'Manual model registration failed.');}
  };

  const discoverModels=async()=>{
    setLoading(true);setError('');
    try{
      const result=await adminApi('/api/admin/models/discover',{method:'POST',body:'{}'});
      await loadAdminData();
      setNotice('Discovery complete: '+result.discovered+' registered models, '+result.healthy+' healthy.');
    }catch(err){setError(err instanceof Error?err.message:'Model discovery failed.');}
    finally{setLoading(false);}
  };

  const saveFallback=async()=>{
    try{
      await adminApi('/api/admin/fallbacks',{method:'PATCH',body:JSON.stringify({
        capability:fallbackCapability,
        orderedModels:fallbackText.split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean)
      })});
      await reloadNotice('Default routing order saved.');
    }catch(err){setError(err instanceof Error?err.message:'Routing update failed.');}
  };

  const saveRate=async()=>{
    try{
      await adminApi('/api/admin/rate-limits',{method:'PATCH',body:JSON.stringify({
        scopeType:rateScope,scopeKey:rateKey,requests:Number(rateRequests),windowSeconds:Number(rateWindow),enabled:true
      })});
      await reloadNotice('Rate-limit policy saved.');
    }catch(err){setError(err instanceof Error?err.message:'Rate-limit update failed.');}
  };

  const toggleFlag=async(flag:any)=>{
    try{
      await adminApi('/api/admin/feature-flags',{method:'PATCH',body:JSON.stringify({
        key:flag.flag_key,enabled:!flag.enabled,description:flag.description||''
      })});
      await reloadNotice('Feature flag updated.');
    }catch(err){setError(err instanceof Error?err.message:'Feature flag update failed.');}
  };

  const createFlag=async()=>{
    if(!newFlag.trim())return;
    try{
      await adminApi('/api/admin/feature-flags',{method:'PATCH',body:JSON.stringify({
        key:newFlag.trim(),enabled:false,description:newFlagDescription
      })});
      setNewFlag('');setNewFlagDescription('');
      await reloadNotice('Feature flag created disabled.');
    }catch(err){setError(err instanceof Error?err.message:'Could not create feature flag.');}
  };

  const sendAnnouncement=async()=>{
    try{
      const saved=await adminApi('/api/admin/announcements',{method:'POST',body:JSON.stringify({title:announcementTitle,body:announcementBody})});
      const delivered=await adminApi('/api/admin/notifications/product-update',{method:'POST',body:JSON.stringify({title:announcementTitle,body:announcementBody})});
      setAnnouncementTitle('');setAnnouncementBody('');
      await loadAdminData();
      setNotice('Announcement '+saved.announcement.id+' published; '+delivered.recipientCount+' opted-in users notified.');
    }catch(err){setError(err instanceof Error?err.message:'Announcement could not be published and delivered.');}
  };

  const loadUsage=async()=>{
    const params=new URLSearchParams();
    if(usageFrom)params.set('from',new Date(usageFrom).toISOString());
    if(usageTo)params.set('to',new Date(usageTo).toISOString());
    if(usageProvider)params.set('provider',usageProvider);
    if(usageModel)params.set('model',usageModel);
    try{
      const result=await adminApi('/api/admin/usage'+(params.size?'?'+params.toString():''));
      setUsageRecords(result.records||[]);setUsageSummary(result.summary||null);
    }catch(err){setError(err instanceof Error?err.message:'Usage data could not be loaded.');}
  };

  const loadErrors=async()=>{
    const params=new URLSearchParams();
    if(errorFrom)params.set('from',new Date(errorFrom).toISOString());
    if(errorTo)params.set('to',new Date(errorTo).toISOString());
    if(errorClass)params.set('class',errorClass);
    if(errorModel)params.set('model',errorModel);
    try{
      const result=await adminApi('/api/admin/errors'+(params.size?'?'+params.toString():''));
      setErrorRows(result.errors||[]);
    }catch(err){setError(err instanceof Error?err.message:'Error records could not be loaded.');}
  };

  const loadAudit=async()=>{
    const params=new URLSearchParams();
    if(auditFrom)params.set('from',new Date(auditFrom).toISOString());
    if(auditTo)params.set('to',new Date(auditTo).toISOString());
    if(auditActor)params.set('actor',auditActor);
    try{
      const result=await adminApi('/api/admin/audit'+(params.size?'?'+params.toString():''));
      setAudit(result.events||[]);
    }catch(err){setError(err instanceof Error?err.message:'Audit records could not be loaded.');}
  };

  const saveSystemConfig=async()=>{
    let value:any;
    try{value=JSON.parse(configValue);}catch{value=configValue;}
    try{
      await adminApi('/api/admin/config/'+encodeURIComponent(configKey),{method:'PUT',body:JSON.stringify({value})});
      await reloadNotice('System configuration saved.');
    }catch(err){setError(err instanceof Error?err.message:'System configuration update failed.');}
  };

  const revokeSession=async(session:any)=>{
    if(!window.confirm('Revoke this active session? The device must sign in again.'))return;
    try{
      await adminApi('/api/admin/sessions/'+encodeURIComponent(session.id),{method:'DELETE'});
      await reloadNotice('Session revoked.');
    }catch(err){setError(err instanceof Error?err.message:'Session could not be revoked.');}
  };

  const exportErrors=()=>{
    const params=new URLSearchParams();
    if(errorFrom)params.set('from',new Date(errorFrom).toISOString());
    if(errorTo)params.set('to',new Date(errorTo).toISOString());
    window.open(API+'/api/admin/errors/export'+(params.size?'?'+params.toString():''),'_blank','noopener,noreferrer');
  };

  const [newAuditDummy] = useState(0);
  const filteredUsers=useMemo(()=>users.filter((u)=>{
    const searchMatch=[u.email,u.display_name,u.id].some((value)=>String(value||'').toLowerCase().includes(search.toLowerCase()));
    const roleMatch=userRoleFilter==='all'||u.role===userRoleFilter;
    const statusMatch=userStatusFilter==='all'||u.status===userStatusFilter;
    const created=new Date(u.created_at).getTime();
    const fromMatch=!userJoinedFrom||created>=new Date(userJoinedFrom+'T00:00:00').getTime();
    const toMatch=!userJoinedTo||created<=new Date(userJoinedTo+'T23:59:59').getTime();
    return searchMatch&&roleMatch&&statusMatch&&fromMatch&&toMatch;
  }).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()),
    [users,search,userRoleFilter,userStatusFilter,userJoinedFrom,userJoinedTo]);
  const userPageSize=50;
  const userPageCount=Math.max(1,Math.ceil(filteredUsers.length/userPageSize));
  const pageUsers=filteredUsers.slice(userPage*userPageSize,(userPage+1)*userPageSize);

  const filteredModels=useMemo(()=>models.filter(m=>{
    const query=modelSearch.trim().toLowerCase();
    const textMatch=!query||[m.id,m.displayName,m.providerId].some(value=>String(value||'').toLowerCase().includes(query));
    const providerMatch=modelProviderFilter==='all'||m.providerId===modelProviderFilter;
    const statusMatch=modelStatusFilter==='all'||
      (modelStatusFilter==='verified'&&Boolean(m.verifiedAt)&&m.lastHealthOk!==false)||
      (modelStatusFilter==='unverified'&&!m.verifiedAt)||
      (modelStatusFilter==='enabled'&&m.enabled)||
      (modelStatusFilter==='disabled'&&!m.enabled);
    return textMatch&&providerMatch&&statusMatch;
  }).sort((a,b)=>a.providerId.localeCompare(b.providerId)||a.displayName.localeCompare(b.displayName)),
    [models,modelSearch,modelProviderFilter,modelStatusFilter]);
  const modelPageSize=50;
  const modelPageCount=Math.max(1,Math.ceil(filteredModels.length/modelPageSize));
  const pageModels=filteredModels.slice(modelPage*modelPageSize,(modelPage+1)*modelPageSize);

  const panel='rounded-2xl border border-slate-800 bg-slate-950/75 p-4 shadow-lg shadow-black/10';
  const field='w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400';
  const primary='rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40';
  const secondary='rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/60 disabled:opacity-40';
  const stat=(label:string,value:any,detail:string,Icon:any)=><div className={panel}><div className="flex items-center justify-between"><span className="text-xs text-slate-400">{label}</span><Icon className="h-4 w-4 text-cyan-300"/></div><div className="mt-3 text-2xl font-black text-white">{fmt(value)}</div><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>;

  if(!authenticated)return <section className="afg-admin-panel mx-auto w-full max-w-xl px-4 py-10">
    <div className="rounded-3xl border border-cyan-800/50 bg-slate-950 p-6 shadow-2xl sm:p-8">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10"><LockKeyhole className="h-7 w-7 text-cyan-300"/></div>
      <h1 className="text-center text-2xl font-black text-white">{dari?'ورود مدیر AFG AI':'AFG AI Admin Console'}</h1>
      <p className="mt-2 text-center text-sm text-slate-400">{dari?'فقط مدیران مجاز می‌توانند وارد شوند.':'Secure administrator access.'}</p>
      <div className="mt-6 space-y-3">
        <input className={field} value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" placeholder="Administrator email"/>
        <input className={field} value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Password"/>
        {showBootstrap&&<>
          <input className={field} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Administrator name"/>
          <input className={field} value={bootstrapToken} onChange={e=>setBootstrapToken(e.target.value)} type="password" placeholder="One-time bootstrap token"/>
          <p className="text-xs text-amber-300">Requires AFG_ADMIN_BOOTSTRAP_TOKEN on the server. Creates the first superadmin, or recovers an existing administrator when you enter that administrator’s exact email address.</p>
        </>}
        <button className={primary+' w-full'} disabled={loading||!email||!password||(showBootstrap&&!bootstrapToken)} onClick={()=>void signIn(showBootstrap)}>{loading?'…':showBootstrap?'Set up / recover administrator':'Sign in securely'}</button>
        <button className="w-full py-2 text-xs text-cyan-300 underline" onClick={()=>setShowBootstrap(value=>!value)}>{showBootstrap?'Back to sign in':'Set up / recover administrator'}</button>
      </div>
      {error&&<p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    </div>
  </section>;

  return <section className="afg-admin-panel mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5 lg:px-7">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 ring-1 ring-cyan-400/30"><ShieldCheck className="h-6 w-6 text-cyan-300"/></div><div><h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">AFG AI <span className="text-cyan-300">Admin</span></h1><p className="text-xs text-slate-500">Control plane · Operations · Security · Transparency</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400 sm:inline">{adminRole||'Administrator'}</span><button className={secondary+' flex items-center gap-2'} disabled={loading} onClick={()=>void loadAdminData()}><RefreshCw className="h-4 w-4"/>Refresh</button><button className={secondary+' flex items-center gap-2'} onClick={()=>void signOut()}><LogOut className="h-4 w-4"/>Sign out</button></div>
    </header>
    {error&&<div role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {notice&&<div role="status" className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</div>}
    {loading&&<div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400"/></div>}

    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-950/80 p-2 lg:sticky lg:top-4">
        <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Control plane</p>
        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {NAV.map(item=>{const Icon=item.icon;return <button key={item.id} aria-current={tab===item.id?'page':undefined} onClick={()=>setTab(item.id)} className={'flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition '+(tab===item.id?'bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/30':'text-slate-400 hover:bg-slate-900 hover:text-white')}><Icon className="h-4 w-4 shrink-0"/><span>{dari?item.labelFa:item.labelEn}</span></button>;})}
        </nav>
      </aside>

      <main className="min-w-0 space-y-4">
        {tab==='overview'&&<div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {stat('Active users today',overview?.dashboard?.activeUsersToday,'Users with an AI request today',Users)}
            {stat('AI requests today',overview?.dashboard?.aiRequestsToday,'Recorded model requests',Activity)}
            <div className={panel}><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Error rate</span><AlertTriangle className="h-4 w-4 text-cyan-300"/></div><div className="mt-3 text-2xl font-black text-white">{overview?.dashboard?.errorRatePercent==null?'—':Number(overview.dashboard.errorRatePercent).toFixed(2)+'%'}</div><p className="mt-1 text-[11px] text-slate-500">Failed AI requests today</p></div>
            <div className={panel}><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Average latency</span><Gauge className="h-4 w-4 text-cyan-300"/></div><div className="mt-3 text-2xl font-black text-white">{overview?.dashboard?.averageLatencyMs==null?'—':fmt(overview.dashboard.averageLatencyMs)+' ms'}</div><p className="mt-1 text-[11px] text-slate-500">AI request average</p></div>
            <div className={panel}><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Known cost today</span><HardDrive className="h-4 w-4 text-cyan-300"/></div><div className="mt-3 text-2xl font-black text-white">{money(overview?.dashboard?.todayCostUsd)}</div><p className="mt-1 text-[11px] text-slate-500">Price coverage: {fmt(overview?.dashboard?.costCoveragePercent)}%</p></div>
          </div>
          <div className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-white">Urgent system alerts</h2><p className="text-xs text-slate-500">Derived from provider, model, usage and error records.</p></div><button className={secondary} onClick={()=>void loadAdminData()}>Refresh alerts</button></div>
            {(overview?.dashboard?.alerts||[]).length>0?<div className="mt-3 grid gap-2 md:grid-cols-2">{overview!.dashboard.alerts.map((alert:any,index:number)=><div key={alert.kind+index} className={'rounded-xl border p-3 '+(alert.severity==='critical'?'border-red-500/30 bg-red-500/5':'border-amber-500/30 bg-amber-500/5')}><div className="flex items-center justify-between gap-2"><b className={alert.severity==='critical'?'text-red-300':'text-amber-300'}>{String(alert.kind).replace(/_/g,' ')}</b><span className="text-[10px] text-slate-500">{alert.count??''}</span></div><p className="mt-1 text-xs text-slate-300">{alert.message}</p></div>)}</div>:<p className="mt-4 text-sm text-emerald-300">No urgent alerts recorded.</p>}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={panel}><h2 className="mb-3 font-bold text-white">Requests by provider · 24h</h2>
              {(overview?.dashboard?.requestsByProvider||[]).map((item:any)=>{const max=Math.max(1,...(overview?.dashboard?.requestsByProvider||[]).map((v:any)=>Number(v.requests)));return <div key={item.provider_key||'unknown'} className="mb-3"><div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">{item.provider_key||'Unknown provider'}</span><span className="text-slate-400">{fmt(item.requests)} · known {money(item.cost_usd)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{width:(Number(item.requests)/max*100)+'%'}}/></div></div>})}
              {!(overview?.dashboard?.requestsByProvider||[]).length&&<p className="text-xs text-slate-500">No provider usage recorded for this period.</p>}
            </div>
            <div className={panel}><h2 className="mb-3 font-bold text-white">Errors by class · 24h</h2>
              {(overview?.dashboard?.errorsByClass||[]).map((item:any)=>{const max=Math.max(1,...(overview?.dashboard?.errorsByClass||[]).map((v:any)=>Number(v.errors)));return <div key={item.error_class} className="mb-3"><div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">{item.error_class}</span><span className="text-slate-400">{fmt(item.errors)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-rose-400" style={{width:(Number(item.errors)/max*100)+'%'}}/></div></div>})}
              {!(overview?.dashboard?.errorsByClass||[]).length&&<p className="text-xs text-slate-500">No classified errors recorded for this period.</p>}
            </div>
          </div>
          <div className={panel}><h2 className="mb-3 font-bold text-white">Latency percentiles · 24h</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{['p50','p95','p99'].map(key=><div key={key} className="rounded-xl bg-slate-900 p-3"><p className="text-xs uppercase text-slate-500">{key}</p><b className="text-xl text-white">{fmt(overview?.dashboard?.latency?.[key])} ms</b></div>)}<div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Daily budget</p><b className="text-xl text-white">{Number(overview?.dashboard?.dailyCostThresholdUsd||0)>0?'$'+Number(overview!.dashboard.dailyCostThresholdUsd).toFixed(2):'Not set'}</b></div></div></div>
          <div className={panel}><h2 className="mb-3 font-bold text-white">Platform snapshot</h2><div className="grid gap-3 sm:grid-cols-3 text-sm"><div><span className="text-slate-400">Registered users</span><p className="text-lg font-bold text-white">{fmt(overview?.users?.total)}</p></div><div><span className="text-slate-400">Suspended accounts</span><p className="text-lg font-bold text-white">{fmt(overview?.users?.suspended)}</p></div><div><span className="text-slate-400">Database size</span><p className="text-lg font-bold text-white">{overview?.storage?.database_bytes?fmt(Number(overview.storage.database_bytes)/1048576)+' MB':'—'}</p></div></div></div>
        </div>}

        {tab==='users'&&<div className={panel}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">User management</h2><p className="text-xs text-slate-500">Search, filter, inspect activity, suspend, promote, delete or email a reset code.</p></div></div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input className={field+' pl-9'} value={search} onChange={e=>{setSearch(e.target.value);setUserPage(0);}} placeholder="Search email, name or ID"/></div>
            <select className={field} value={userRoleFilter} onChange={e=>{setUserRoleFilter(e.target.value);setUserPage(0);}}><option value="all">All roles</option><option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select>
            <select className={field} value={userStatusFilter} onChange={e=>{setUserStatusFilter(e.target.value);setUserPage(0);}}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option></select>
            <input className={field} type="date" aria-label="Joined from" value={userJoinedFrom} onChange={e=>{setUserJoinedFrom(e.target.value);setUserPage(0);}}/>
            <input className={field} type="date" aria-label="Joined to" value={userJoinedTo} onChange={e=>{setUserJoinedTo(e.target.value);setUserPage(0);}}/>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-slate-500"><tr>{['User','Role','Status','Last activity','Requests 30d','Actions'].map(x=><th key={x} className="border-b border-slate-800 px-3 py-3">{x}</th>)}</tr></thead><tbody>
            {pageUsers.map(user=><tr key={user.id} className="border-b border-slate-900"><td className="px-3 py-3"><p className="font-semibold text-white">{user.display_name||user.email||'Unnamed user'}</p><p className="mt-1 text-[10px] text-slate-500">{user.email} · {user.id.slice(0,8)}</p></td><td className="px-3 py-3 text-slate-300">{user.role}</td><td className="px-3 py-3"><span className={user.status==='active'?'text-emerald-300':user.status==='deleted'?'text-slate-500':'text-amber-300'}>{user.status}</span></td><td className="px-3 py-3 text-slate-400">{date(user.last_seen_at)}</td><td className="px-3 py-3 text-slate-300">{fmt(user.requests_30d)}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">
              <button className={secondary} onClick={()=>void openUserProfile(user)}>Profile</button>
              {user.status!=='deleted'&&<button className={secondary} onClick={()=>void sendPasswordReset(user)}>Reset password</button>}
              {user.id!==selectedUser?.id&&user.status!=='deleted'&&<button className={secondary} onClick={()=>void confirmUserChange(user,{status:user.status==='active'?'suspended':'active'})}>{user.status==='active'?'Suspend':'Reactivate'}</button>}
              {(adminRole==='admin'||isSuperadmin)&&user.status!=='deleted'&&<select aria-label="Assign user role" className={field+' max-w-44'} value={user.role} onChange={event=>{const nextRole=event.target.value;if(nextRole!==user.role)void confirmUserChange(user,{role:nextRole});}}>
                {['user','admin',...(isSuperadmin?['superadmin']:[]),...staffRoles.map((role:any)=>role.name).filter((name:string)=>!['user','admin','superadmin'].includes(name))].filter((role,index,all)=>all.indexOf(role)===index).map(role=><option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}
              </select>}
              {isSuperadmin&&user.status!=='deleted'&&<button className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300" onClick={()=>void confirmUserChange(user,{status:'deleted'})}>Soft delete</button>}
            </div></td></tr>)}
          </tbody></table>{!filteredUsers.length&&<p className="py-8 text-center text-sm text-slate-500">No users match these filters.</p>}</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>{fmt(filteredUsers.length)} users · Page {userPage+1} of {userPageCount}</span><div className="flex gap-2"><button className={secondary} disabled={userPage===0} onClick={()=>setUserPage(value=>Math.max(0,value-1))}>Previous</button><button className={secondary} disabled={userPage+1>=userPageCount} onClick={()=>setUserPage(value=>Math.min(userPageCount-1,value+1))}>Next</button></div></div>
          {selectedUser&&<div className="mt-4 rounded-xl border border-cyan-500/30 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-white">User profile · {selectedUser.display_name||selectedUser.email}</h3><button className={secondary} onClick={()=>setSelectedUser(null)}>Close</button></div>
            <div className="mt-3 grid gap-3 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3"><p>Email: {selectedUser.email||'—'}</p><p>Role: {selectedUser.role}</p><p>Status: {selectedUser.status}</p><p>Joined: {date(selectedUser.created_at)}</p><p>Last login: {date(selectedUser.last_login)}</p><p>Conversations: {fmt(selectedUser.conversationCount)}</p><p>Input tokens: {fmt(selectedUser.usage?.input_tokens)}</p><p>Output tokens: {fmt(selectedUser.usage?.output_tokens)}</p><p>Total known cost: {money(selectedUser.usage?.total_cost)}</p></div>
            {selectedUser.activity?.length>0&&<div className="mt-4 border-t border-slate-800 pt-3"><h4 className="mb-2 text-sm font-bold text-white">Recent AI activity</h4><div className="space-y-2">{selectedUser.activity.map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950 p-2 text-[10px]"><span className="text-slate-300">{item.provider_key||'—'} · {item.model_key||'—'} · {item.status}</span><span className="text-slate-500">{date(item.created_at)} · {fmt(item.tokens_in)} in / {fmt(item.tokens_out)} out · {money(item.cost_usd,5)}</span></div>)}</div></div>}
          </div>}
        </div>}

        {tab==='staff'&&<div className="space-y-4">
          <div className={panel}>
            <h2 className="text-lg font-bold text-white">Staff roles and permissions</h2>
            <p className="my-2 text-xs text-slate-500">Permissions are checked by the backend. Only root administrators can edit role permission maps. Root roles cannot be assigned through these role editors.</p>
            <div className="space-y-4">
              {staffRoles.filter((role:any)=>!['user','admin','superadmin'].includes(role.name)).map((role:any)=><div key={role.name} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold text-white">{role.name.replaceAll('_',' ')}</h3><button className={primary} onClick={()=>void saveStaffRole(role)}>Save permissions</button></div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{STAFF_PERMISSIONS.map(permission=><label key={permission} className="flex items-center gap-2 rounded-lg border border-slate-800 px-2 py-2 text-[11px] text-slate-300"><input type="checkbox" checked={role.permissions_json?.[permission]===true} onChange={event=>setStaffRoles(previous=>previous.map(item=>item.name===role.name?{...item,permissions_json:{...(item.permissions_json||{}),[permission]:event.target.checked}}:item))}/>{permission}</label>)}</div>
              </div>)}
            </div>
            {!staffRoles.some((role:any)=>!['user','admin','superadmin'].includes(role.name))&&<p className="py-6 text-center text-sm text-slate-500">Staff roles will appear after database migration 0008 is applied.</p>}
          </div>
        </div>}

        {tab==='providers'&&<div className="space-y-4">
          {isSuperadmin&&<div className={panel}><h2 className="text-lg font-bold text-white">Add custom provider</h2><p className="mb-3 text-xs text-slate-500">Register multiple public HTTPS OpenAI-compatible or Anthropic Messages endpoints. New providers start disabled.</p>
            <div className="grid gap-2 md:grid-cols-4"><input className={field} value={customSlug} onChange={e=>setCustomSlug(e.target.value)} placeholder="provider-slug"/><input className={field} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Display name"/><input className={field} value={customBaseUrl} onChange={e=>setCustomBaseUrl(e.target.value)} placeholder="https://api.example.com/v1"/><select className={field} value={customProtocol} onChange={e=>setCustomProtocol(e.target.value as any)}><option value="openai-compatible">OpenAI-compatible</option><option value="anthropic-messages">Anthropic Messages API</option></select></div>
            <button className={primary+' mt-3'} disabled={!customSlug.trim()||!customName.trim()||!customBaseUrl.trim()} onClick={()=>void createCustomProvider()}>Register custom provider</button>
          </div>}
          <div className={panel}><div className="mb-4"><h2 className="text-lg font-bold text-white">Provider inventory</h2><p className="text-xs text-slate-500">Built-in providers are pre-seeded. Secrets remain encrypted in server-side storage.</p></div>
            <div className="grid gap-3 md:grid-cols-2">{providers.map(provider=><div key={provider.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-white">{provider.displayName}</h3><p className="mt-1 text-xs text-slate-500">{provider.id} · {provider.kind||'provider'} · {provider.source||'system'}</p></div><span className={provider.last_health_ok===true?'text-emerald-300':provider.last_health_ok===false?'text-red-300':provider.configured?'text-cyan-300':'text-amber-300'}>{provider.last_health_ok===true?'Healthy':provider.last_health_ok===false?'Health error':provider.configured?'Configured':provider.has_key?'Key stored · adapter unavailable':'Missing credentials'}</span></div>
              <p className="mt-2 break-all text-[11px] text-slate-500">{provider.base_url||'Managed by Cloudflare environment'} · Last check {date(provider.last_health_at)} {provider.keyStatus?'· Key '+provider.keyStatus:''} {isSuperadmin&&provider.keyHint?'· hint …'+provider.keyHint:''}</p>
              <div className="mt-3 flex flex-wrap gap-2"><button className={secondary} onClick={()=>void testProvider(provider)}><Play className="mr-1 inline h-3 w-3"/>Test connection</button><button className={secondary} onClick={()=>void discoverProvider(provider)}><RefreshCw className="mr-1 inline h-3 w-3"/>Discover models</button><button className={secondary} onClick={()=>void toggleProvider(provider)}><Power className="mr-1 inline h-3 w-3"/>{provider.enabled?'Disable':'Enable'}</button></div>
              {isSuperadmin&&provider.kind!=='cloudflare'&&provider.kind!=='ollama'&&<div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <label className="block text-[11px] text-slate-400">Provider base URL</label><input className={field} value={providerBaseUrls[provider.id]??provider.base_url??''} onChange={e=>setProviderBaseUrls(current=>({...current,[provider.id]:e.target.value}))} placeholder="https://api.example.com/v1"/>
                <button className={secondary} onClick={()=>void saveProviderConfig(provider)}>Save endpoint configuration</button>
                <label className="block text-[11px] text-slate-400">Provider API key · saved value is never displayed</label><input className={field} type="password" autoComplete="new-password" value={providerSecrets[provider.id]||''} onChange={e=>setProviderSecrets(current=>({...current,[provider.id]:e.target.value}))} placeholder="Paste a new API key"/>
                <div className="flex flex-wrap gap-2"><button className={secondary} onClick={()=>void saveProviderKey(provider,false)}><KeyRound className="mr-1 inline h-3 w-3"/>Save key</button><button className={secondary} onClick={()=>void saveProviderKey(provider,true)}>Rotate key</button></div>
              </div>}
            </div>)}</div>
          </div>
        </div>}

        {tab==='models'&&<div className="space-y-4">
          <div className={panel}><h2 className="mb-2 text-lg font-bold text-white">Manual model registration</h2><p className="mb-3 text-xs text-slate-500">Exact upstream ID only. Manually registered entries are disabled and unverified until a real inference probe succeeds.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><select className={field} value={manualProviderId} onChange={e=>setManualProviderId(e.target.value)}>{providers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select><input className={field} value={manualModelId} onChange={e=>setManualModelId(e.target.value)} placeholder="Exact model ID"/><input className={field} value={manualModelName} onChange={e=>setManualModelName(e.target.value)} placeholder="Display name (optional)"/><input className={field} type="number" value={manualContext} onChange={e=>setManualContext(e.target.value)} placeholder="Context window (optional)"/></div>
            <button className={primary+' mt-3'} disabled={!manualProviderId||!manualModelId.trim()} onClick={()=>void addManualModel()}>Register model</button>
          </div>
          <div className={panel}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Model catalogue</h2><p className="text-xs text-slate-500">All registered rows are manageable here. User availability still requires enablement and a recent successful model test.</p></div><button className={primary} onClick={()=>void discoverModels()}>Discover / refresh configured providers</button></div>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <button className={secondary} onClick={selectFilteredModels}>Select all filtered ({fmt(filteredModels.length)})</button>
              <span className="text-xs text-slate-400">{selectedModelKeys.size} selected</span>
              <button className={primary} disabled={!selectedModelKeys.size||bulkAction!==null} onClick={()=>void bulkSetModels(true)}>{bulkAction==='enable'?'Enabling…':'Enable selected'}</button>
              <button className={secondary} disabled={!selectedModelKeys.size||bulkAction!==null} onClick={()=>void bulkSetModels(false)}>{bulkAction==='disable'?'Disabling…':'Disable selected'}</button>
              <button className={secondary} disabled={!selectedModelKeys.size||bulkAction!==null} onClick={()=>setSelectedModelKeys(new Set())}>Clear selection</button>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-3"><input className={field} value={modelSearch} onChange={e=>{setModelSearch(e.target.value);setModelPage(0);}} placeholder="Search provider or model ID"/><select className={field} value={modelProviderFilter} onChange={e=>{setModelProviderFilter(e.target.value);setModelPage(0);}}><option value="all">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select><select className={field} value={modelStatusFilter} onChange={e=>{setModelStatusFilter(e.target.value);setModelPage(0);}}><option value="all">All model states</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
            <div className="space-y-3">{pageModels.map(model=><div key={model.providerId+':'+model.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><input aria-label={'Select '+model.id} type="checkbox" className="mt-1 h-4 w-4 accent-cyan-400" checked={selectedModelKeys.has(modelKey(model))} onChange={()=>toggleModelSelection(model)}/><div><p className="font-semibold text-white">{model.displayName}</p><p className="text-[10px] text-slate-500">{model.providerId} · {model.id} · {fmt(model.contextWindow)} context · Max output {fmt(model.maxOutput)}</p><p className="mt-1 text-[10px] text-slate-500">Access tier: <b className="text-cyan-300">{(model.requiredTier||'free').toUpperCase()}</b></p></div></div>
                <div className="flex flex-wrap gap-2"><span className={model.verifiedAt?'text-emerald-300':'text-amber-300'}>{model.verifiedAt?'Verified':'Unverified'}</span><select aria-label="Required subscription tier" className={field+' max-w-28'} value={model.requiredTier||'free'} onChange={e=>void patchModel(model,{requiredTier:e.target.value})}><option value="free">Free</option><option value="pro">Pro</option><option value="max">Max</option><option value="ultra">Ultra</option></select><button className={model.enabled?primary:secondary} onClick={()=>void patchModel(model,{enabled:!model.enabled})}>{model.enabled?'Enabled':'Disabled'}</button><button className={secondary} onClick={()=>void testModel(model)}>Test</button><button className="rounded-xl border border-red-500/40 px-3 py-2 text-xs text-red-300" onClick={()=>void deleteModel(model)}>Delete</button></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{CAPABILITIES.map(cap=><label key={cap} className="flex items-center gap-1 rounded-lg border border-slate-800 px-2 py-1 text-[10px] text-slate-300"><input type="checkbox" checked={Boolean(model.capabilities?.[cap])} onChange={e=>{const next={...model.capabilities,[cap]:e.target.checked};void patchModel(model,{capabilities:Object.keys(next).filter(key=>next[key])});}}/>{cap}</label>)}</div>
              <p className="mt-2 text-[10px] text-slate-500">{model.verifiedAt?'Health verified '+date(model.verifiedAt):'Not currently verified'} · {model.lastHealthOk?'Last probe successful':'Last probe not successful'} · In cost {money(model.inputCostPerMillion,5)} / Out cost {money(model.outputCostPerMillion,5)} per million tokens</p>
            </div>)}</div>
            {!filteredModels.length&&<p className="text-sm text-slate-500">No registered models match these filters.</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>{fmt(filteredModels.length)} models · Page {modelPage+1} of {modelPageCount}</span><div className="flex gap-2"><button className={secondary} disabled={modelPage===0} onClick={()=>setModelPage(value=>Math.max(0,value-1))}>Previous</button><button className={secondary} disabled={modelPage+1>=modelPageCount} onClick={()=>setModelPage(value=>Math.min(modelPageCount-1,value+1))}>Next</button></div></div>
          </div>
          <div className={panel}><h2 className="font-bold text-white">Default routing / fallback order</h2><p className="my-2 text-xs text-slate-500">One providerId::modelId per line. The server accepts only enabled models that have the requested capability.</p><select className={field+' mb-3'} value={fallbackCapability} onChange={e=>setFallbackCapability(e.target.value)}>{['text','vision','imageGen','tts','stt'].map(value=><option key={value}>{value}</option>)}</select><textarea className={field+' font-mono'} rows={5} value={fallbackText} onChange={e=>setFallbackText(e.target.value)}/><button className={primary+' mt-3'} onClick={()=>void saveFallback()}><Save className="mr-1 inline h-4 w-4"/>Save routing order</button></div>
        </div>}

        {tab==='usage'&&<div className="space-y-4">
          <div className={panel}><h2 className="mb-3 text-lg font-bold text-white">AI usage records</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Requests</p><b className="text-xl text-white">{fmt(usageSummary?.requests)}</b></div>
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Input tokens</p><b className="text-xl text-white">{fmt(usageSummary?.input_tokens)}</b></div>
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Output tokens</p><b className="text-xl text-white">{fmt(usageSummary?.output_tokens)}</b></div>
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Known cost · USD</p><b className="text-xl text-white">{money(usageSummary?.cost_usd)}</b><p className="mt-1 text-[10px] text-slate-500">{fmt(usageSummary?.priced_requests)} priced · {fmt(usageSummary?.unpriced_requests)} unknown</p></div>
            <div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Average latency</p><b className="text-xl text-white">{fmt(usageSummary?.avg_latency_ms)} ms</b></div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input className={field} type="datetime-local" value={usageFrom} onChange={e=>setUsageFrom(e.target.value)}/><input className={field} type="datetime-local" value={usageTo} onChange={e=>setUsageTo(e.target.value)}/><select className={field} value={usageProvider} onChange={e=>setUsageProvider(e.target.value)}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select><input className={field} value={usageModel} onChange={e=>setUsageModel(e.target.value)} placeholder="Exact model ID"/></div>
          <button className={primary+' mt-3'} onClick={()=>void loadUsage()}>Apply usage filters</button><p className="mt-2 text-[10px] text-slate-500">Cost totals include only requests whose providers publish pricing. Unknown prices are not displayed as zero.</p></div>
          <div className={panel}><h3 className="mb-3 font-bold text-white">Usage detail</h3><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-slate-500"><tr>{['Time','User','Provider','Model','Input','Output','Cost','Latency','Status'].map(value=><th key={value} className="border-b border-slate-800 p-3">{value}</th>)}</tr></thead><tbody>{usageRecords.map((row:any)=><tr key={row.id} className="border-b border-slate-900 text-slate-300"><td className="p-3">{date(row.created_at)}</td><td className="p-3">{row.user_id||'Guest'}</td><td className="p-3">{row.provider_key||'—'}</td><td className="p-3 font-mono">{row.model_key||row.model_id||'—'}</td><td className="p-3">{fmt(row.tokens_in)}</td><td className="p-3">{fmt(row.tokens_out)}</td><td className="p-3">{money(row.cost_usd,5)}</td><td className="p-3">{fmt(row.latency_ms)} ms</td><td className="p-3">{row.status}</td></tr>)}</tbody></table>{!usageRecords.length&&<p className="py-6 text-center text-xs text-slate-500">No usage records match these filters.</p>}</div></div>
        </div>}

        {tab==='errors'&&<div className="space-y-4"><div className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Error monitoring</h2><p className="text-xs text-slate-500">Redacted messages with request IDs and safe metadata.</p></div><button className={secondary} onClick={exportErrors}>Export CSV</button></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input className={field} type="datetime-local" value={errorFrom} onChange={e=>setErrorFrom(e.target.value)}/><input className={field} type="datetime-local" value={errorTo} onChange={e=>setErrorTo(e.target.value)}/><select className={field} value={errorClass} onChange={e=>setErrorClass(e.target.value)}><option value="">All error classes</option>{['network','auth','rate_limit','provider_5xx','invalid_request','content_policy','timeout','unavailable','unknown'].map(value=><option key={value}>{value}</option>)}</select><input className={field} value={errorModel} onChange={e=>setErrorModel(e.target.value)} placeholder="Model ID"/></div>
          <button className={primary+' mt-3'} onClick={()=>void loadErrors()}>Apply error filters</button>
        </div>
        <div className={panel}><div className="space-y-2">{errorRows.map((row:any)=><div key={row.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-xs text-rose-300">{row.error_class} · {row.error_code}</b><span className="text-[10px] text-slate-500">{date(row.created_at)}</span></div><p className="mt-1 break-all font-mono text-[10px] text-cyan-200">Request: {row.request_id}</p><p className="mt-2 text-xs text-slate-300">{row.message_redacted}</p><p className="mt-1 text-[10px] text-slate-500">{row.provider_key||'—'} · {row.model_id||'—'} · {row.user_id||'Guest'}</p></div>)}{!errorRows.length&&<p className="py-6 text-center text-xs text-slate-500">No error records match these filters.</p>}</div></div>
        </div>}

        {tab==='limits'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Rate-limit policy</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select className={field} value={rateScope} onChange={e=>setRateScope(e.target.value)}><option value="user">Per user</option><option value="tier">Per tier</option><option value="model">Per model</option></select><input className={field} value={rateKey} onChange={e=>setRateKey(e.target.value)} placeholder="User ID / tier / model ID"/><input className={field} type="number" min="1" value={rateRequests} onChange={e=>setRateRequests(e.target.value)} placeholder="Requests"/><input className={field} type="number" min="1" value={rateWindow} onChange={e=>setRateWindow(e.target.value)} placeholder="Window seconds"/></div><button className={primary+' mt-3'} onClick={()=>void saveRate()}>Save policy</button><p className="mt-2 text-xs text-slate-500">Admin API calls have a separate 100 requests/minute per-admin limit.</p></div><div className={panel}><h3 className="mb-3 font-bold text-white">Configured policies</h3><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs"><thead className="text-slate-500"><tr>{['Scope','Key','Limit','Window','Status'].map(value=><th key={value} className="border-b border-slate-800 p-3">{value}</th>)}</tr></thead><tbody>{policies.map(policy=><tr key={policy.id} className="border-b border-slate-900 text-slate-300"><td className="p-3">{policy.scope_type}</td><td className="p-3">{policy.scope_key}</td><td className="p-3">{policy.requests} requests</td><td className="p-3">{policy.window_seconds}s</td><td className="p-3">{policy.enabled?'Enabled':'Disabled'}</td></tr>)}</tbody></table></div></div></div>}

        {tab==='health'&&<div className="space-y-4"><div className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">System health</h2><p className="text-xs text-slate-500">Provider catalogue reachability is separated from stored successful inference checks.</p></div><button className={primary} onClick={()=>void loadHealth()}>Refresh system health</button></div>
          {health&&<div className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2 text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300"/>Database</div><p className="mt-2 text-sm text-slate-300">{health.database?.healthy?'Healthy':'Unavailable'} · {fmt(health.database?.latencyMs)} ms</p></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2 text-white"><Activity className="h-4 w-4 text-cyan-300"/>Queues</div><p className="mt-2 text-sm text-slate-300">{health.queues?.status||'Unknown'}</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">{(health.providers||[]).map((provider:any)=><div key={provider.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><p className="font-semibold text-white">{provider.id}</p><p className={provider.healthy?'text-emerald-300':'text-amber-300'}>{provider.healthy?'Inference verified':'No recent successful inference check'} · {provider.latencyMs==null?'—':provider.latencyMs+' ms'}</p><p className="mt-1 text-[10px] text-slate-500">Catalog {provider.catalogReachable?'reachable':'unavailable'} · Models {fmt(provider.modelCount)} · Last inference check {date(provider.lastHealthAt)}</p></div>)}</div>
            <p className="text-[10px] text-slate-500">App version {health.app?.version||'unknown'} · Last migration {health.database?.lastMigration||'unknown'} {health.database?.migrationAppliedAt?'· '+date(health.database.migrationAppliedAt):''}</p>
          </div>}
        </div>
        <div className={panel}><h3 className="mb-3 font-bold text-white">Storage usage</h3><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">PostgreSQL database</p><b className="text-xl text-white">{overview?.storage?.database_bytes?fmt(Number(overview.storage.database_bytes)/1048576)+' MB':'—'}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Generated asset records</p><b className="text-xl text-white">{fmt(overview?.storage?.asset_records)}</b></div><div className="rounded-xl bg-slate-900 p-3"><p className="text-xs text-slate-500">Conversations</p><b className="text-xl text-white">{fmt(overview?.storage?.conversations)}</b></div></div><p className="mt-3 text-xs text-slate-500">R2: {overview?.storage?.r2Configured?'Configured':'Not configured / unknown'} · KV: {overview?.storage?.kvConfigured?'Configured':'Not configured / unknown'}. External bucket byte usage is not available through the current adapter.</p></div></div>}

        {tab==='config'&&<div className="space-y-4"><div className={panel}><h2 className="text-lg font-bold text-white">System configuration</h2><p className="mb-3 text-xs text-slate-500">Values are stored in PostgreSQL and changes are audited. Never store API secrets here.</p><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className={field} value={configKey} onChange={e=>setConfigKey(e.target.value)} placeholder="Configuration key"/><input className={field} value={configValue} onChange={e=>setConfigValue(e.target.value)} placeholder="JSON value or string"/><button className={primary} onClick={()=>void saveSystemConfig()}>Save</button></div><p className="mt-2 text-[10px] text-slate-500">Example: daily_cost_threshold_usd = 25</p></div>
          <div className={panel}><h3 className="mb-3 font-bold text-white">Stored configuration</h3><div className="space-y-2">{systemConfig.map((item:any)=><div key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><b className="text-xs text-cyan-200">{item.key}</b><p className="mt-1 break-all text-[11px] text-slate-300">{JSON.stringify(item.value_json)}</p></div><button className={secondary} onClick={()=>{setConfigKey(item.key);setConfigValue(JSON.stringify(item.value_json));}}>Edit</button></div>)}{!systemConfig.length&&<p className="text-xs text-slate-500">No configuration values saved.</p>}</div></div>
        </div>}

        {tab==='flags'&&<div className="space-y-4"><div className={panel}><h2 className="mb-3 text-lg font-bold text-white">Feature flags</h2><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className={field} value={newFlag} onChange={e=>setNewFlag(e.target.value)} placeholder="feature.key"/><input className={field} value={newFlagDescription} onChange={e=>setNewFlagDescription(e.target.value)} placeholder="Description"/><button className={primary} onClick={()=>void createFlag()}><Plus className="mr-1 inline h-4 w-4"/>Add disabled flag</button></div><div className="mt-4 space-y-2">{flags.map(flag=><div key={flag.flag_key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><p className="font-semibold text-white">{flag.flag_key}</p><p className="text-xs text-slate-500">{flag.description}</p></div><button className={flag.enabled?primary:secondary} onClick={()=>void toggleFlag(flag)}>{flag.enabled?'Enabled':'Disabled'}</button></div>)}</div></div>
          <div className={panel}><h2 className="mb-2 font-bold text-white">Publish announcement</h2><p className="mb-3 text-xs text-slate-500">Persists an announcement for the home screen and sends in-app notifications to opted-in users.</p><input className={field+' mb-2'} value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} maxLength={120} placeholder="Announcement title"/><textarea className={field} rows={4} value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} maxLength={2000} placeholder="Announcement message"/><button className={primary+' mt-3'} disabled={!announcementTitle.trim()||!announcementBody.trim()} onClick={()=>void sendAnnouncement()}>Publish and notify</button><div className="mt-4 space-y-2">{announcements.map((item:any)=><div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3"><b className="text-sm text-white">{item.title}</b><p className="mt-1 text-xs text-slate-300">{item.body}</p><p className="mt-1 text-[10px] text-slate-500">{date(item.created_at)} · {item.enabled?'Published':'Disabled'}</p></div>)}</div></div>
        </div>}

        {tab==='audit'&&<div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Immutable audit log</h2><p className="mb-4 text-xs text-slate-500">Append-only database trigger blocks application UPDATE and DELETE. Before/after state is retained for admin mutations.</p><div className="mb-4 grid gap-2 sm:grid-cols-3"><input className={field} type="datetime-local" value={auditFrom} onChange={e=>setAuditFrom(e.target.value)}/><input className={field} type="datetime-local" value={auditTo} onChange={e=>setAuditTo(e.target.value)}/><div className="flex gap-2"><input className={field} value={auditActor} onChange={e=>setAuditActor(e.target.value)} placeholder="Actor email or ID"/><button className={primary} onClick={()=>void loadAudit()}>Filter</button></div></div><div className="space-y-2">{audit.map((event:any)=><div key={event.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-xs text-cyan-200">{event.action}</b><span className="text-[10px] text-slate-500">{date(event.created_at)}</span></div><p className="mt-1 text-xs text-slate-300">{event.actor_email||'System'} · {event.actor_role||'system'} · {event.target_type||'—'} / {event.target_id||'—'}</p>{event.before_json!=null&&<details className="mt-2"><summary className="cursor-pointer text-[10px] text-slate-400">Before state</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(event.before_json,null,2)}</pre></details>}{event.after_json!=null&&<details className="mt-2"><summary className="cursor-pointer text-[10px] text-slate-400">After state</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(event.after_json,null,2)}</pre></details>}<pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(event.metadata)}</pre></div>)}{!audit.length&&<p className="text-sm text-slate-500">No audit events match these filters.</p>}</div></div>}

        {tab==='connections'&&<AfgConnectionsPanel/>}
        {tab==='api-hub'&&<AfgApiHubPanel language={language} adminMode canSync={isSuperadmin}/>}
        {tab==='mcp'&&<AfgMcpPanel language={language}/>}
        {tab==='9router'&&<AfgNineRouterPanel language={language}/>}
        {tab==='terminal'&&<AfgOnlineAdminTerminal language={language}/> }

        {tab==='security'&&<div className="space-y-4"><div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Active sessions</h2><p className="mb-4 text-xs text-slate-500">Session metadata only; raw session tokens are never returned.</p><div className="space-y-2">{sessions.map((session:any)=><div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div><b className="text-xs text-white">{session.email}</b><p className="mt-1 text-[10px] text-slate-400">{session.user_agent||'Unknown device'} · IP {session.ip||'—'}</p><p className="mt-1 text-[10px] text-slate-500">Last seen {date(session.last_seen_at)} · Expires {date(session.expires_at)}</p></div><button className="rounded-xl border border-red-500/40 px-3 py-2 text-xs text-red-300" onClick={()=>void revokeSession(session)}>Revoke session</button></div>)}{!sessions.length&&<p className="text-sm text-slate-500">No active sessions found.</p>}</div></div>
          <div className={panel}><h2 className="mb-1 text-lg font-bold text-white">Security events</h2><p className="mb-4 text-xs text-slate-500">Authentication denials and API failures. Sensitive credential values are excluded.</p><div className="space-y-2">{security.map((event:any)=><div key={event.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-cyan-300"/><b className="text-sm text-white">{event.event_type}</b></div><span className="text-[10px] text-slate-500">{date(event.created_at)}</span></div><p className="mt-1 text-[10px] text-slate-400">Severity: {event.severity} · User: {event.user_id||'unknown'} · Request: {event.request_id||'—'}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(event.metadata)}</pre></div>)}{!security.length&&<p className="text-sm text-slate-500">No security events recorded.</p>}</div></div>
        </div>}
      </main>
    </div>
  </section>;
};
