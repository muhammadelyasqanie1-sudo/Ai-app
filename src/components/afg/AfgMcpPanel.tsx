import React,{useCallback,useEffect,useState} from 'react';
import { Activity, CheckCircle2, ExternalLink, Network, Power, RefreshCw, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import type {Language} from '../../types/afg';
type DirectoryServer={slug:string;name:string;description:string;auth_type:string;transports:string[];website_url:string|null;install_url:string|null;endpoint_url:string|null;source_url:string};
type RemoteServer={id:string;name:string;endpointUrl:string;authType:string;enabled:boolean;status:string;protocolVersion:string|null;serverInfo:Record<string,any>;tools:any[];lastCheckedAt:string|null;lastError:string|null};
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('afg_csrf='))?.slice(9)||'');
async function request(path:string,init:RequestInit={}){
 const headers=new Headers(init.headers||{});if(init.body!==undefined)headers.set('Content-Type','application/json');
 if(init.method&&init.method.toUpperCase()!=='GET')headers.set('X-CSRF-Token',csrf());
 const response=await fetch(path,{...init,headers,credentials:'include',cache:'no-store'});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||('HTTP '+response.status));return data;
}
export const AfgMcpPanel:React.FC<{language:Language}>=({language})=>{
 const dari=language==='dari'||language==='persian';
 const t=(en:string,fa:string)=>dari?fa:en;
 const [directory,setDirectory]=useState<DirectoryServer[]>([]);
 const [servers,setServers]=useState<RemoteServer[]>([]);
 const [name,setName]=useState('');
 const [endpoint,setEndpoint]=useState('');
 const [authType,setAuthType]=useState<'none'|'bearer'>('none');
 const [token,setToken]=useState('');
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [encryptionConfigured,setEncryptionConfigured]=useState(false);
 const load=useCallback(async()=>{
  const [catalog,connected]=await Promise.all([request('/api/mcp/directory'),request('/api/mcp/servers')]);
  setDirectory(catalog.servers||[]);setServers(connected.servers||[]);setEncryptionConfigured(Boolean(connected.encryptionConfigured));
 },[]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Could not load MCP registry.'));},[load]);
 const act=async(key:string,fn:()=>Promise<any>)=>{
  setBusy(key);setError('');setNotice('');
  try{const result=await fn();setNotice(result?.toolCount!==undefined?t('Server verified: '+result.toolCount+' tools discovered.','سرور تأیید شد؛ '+result.toolCount+' ابزار شناسایی شد.'):t('Saved.','ذخیره شد.'));await load();}
  catch(e){setError(e instanceof Error?e.message:'MCP operation failed.');await load().catch(()=>{});}
  finally{setBusy('');}
 };
 const add=()=>act('add',async()=>{
  const saved=await request('/api/mcp/servers',{method:'POST',body:JSON.stringify({name,endpointUrl:endpoint,authType,token:authType==='bearer'?token:''})});
  setName('');setEndpoint('');setToken('');
  const id=saved.server?.id;
  if(id)return request('/api/mcp/servers/'+id+'/test',{method:'POST',body:'{}'});
  return saved;
 });
 const choose=(item:DirectoryServer)=>{
  setName(item.name);
  if(item.endpoint_url){setEndpoint(item.endpoint_url);setAuthType(item.auth_type.toLowerCase()==='apikey'?'bearer':'none');}
 };
 const verify=(server:RemoteServer)=>act(server.id,()=>request('/api/mcp/servers/'+server.id+'/test',{method:'POST',body:'{}'}));
 const toggle=(server:RemoteServer)=>act(server.id,()=>request('/api/mcp/servers/'+server.id,{method:'PATCH',body:JSON.stringify({enabled:!server.enabled})}));
 const remove=(server:RemoteServer)=>{
  if(!window.confirm(t('Delete this remote MCP connection and its encrypted credential?','این اتصال MCP و اعتبارنامه رمزگذاری‌شده آن حذف شود؟')))return;
  void act(server.id,()=>request('/api/mcp/servers/'+server.id,{method:'DELETE'}));
 };
 return <div className="space-y-4">
  <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
   <div className="flex items-start gap-3"><div className="rounded-xl border border-violet-400/30 bg-slate-950 p-2"><Network className="h-5 w-5 text-violet-300"/></div><div><h2 className="text-lg font-black text-white">MCP · Model Context Protocol</h2><p className="mt-1 text-xs leading-5 text-slate-400">{t('Browse the Public APIs MCP directory and connect remote Streamable HTTP servers to your own AFG AI account. Each server is isolated by user and must pass a real tools/list verification before activation.','فهرست MCP را مرور و سرورهای Remote Streamable HTTP را به حساب AFG AI خود وصل کنید. هر سرور از حساب‌های دیگر جدا است و پیش از فعال‌سازی باید واقعاً تأیید شود.')}</p></div></div>
   <p className={'mt-3 text-xs '+(encryptionConfigured?'text-emerald-300':'text-amber-300')}>{encryptionConfigured?t('Encrypted credential vault is configured.','خزانه رمزگذاری اعتبارنامه فعال است.'):t('Set AFG_INTEGRATION_ENCRYPTION_KEY on the server before saving bearer credentials.','پیش از ذخیره توکن، متغیر AFG_INTEGRATION_ENCRYPTION_KEY را در سرور تنظیم کنید.')}</p>
  </section>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">{notice}</div>}
  <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
   <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="font-bold text-white">{t('Connect remote MCP server','اتصال سرور MCP از راه دور')}</h3><p className="mt-1 text-[11px] text-slate-500">{t('Only public HTTPS Streamable HTTP endpoints are accepted. STDIO remains sandbox-disabled.','فقط نشانی HTTPS عمومی با انتقال Streamable HTTP پذیرفته می‌شود. اجرای STDIO تا آماده‌شدن Sandbox غیرفعال است.')}</p></div><ShieldCheck className="h-5 w-5 text-violet-300"/></div>
   <div className="grid gap-2 sm:grid-cols-2">
    <input value={name} onChange={e=>setName(e.target.value)} placeholder={t('Connection name','نام اتصال')} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>
    <input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://service.example/mcp" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>
    <select value={authType} onChange={e=>setAuthType(e.target.value as 'none'|'bearer')} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="none">{t('No authentication','بدون احراز هویت')}</option><option value="bearer">Bearer token</option></select>
    {authType==='bearer'&&<input type="password" autoComplete="new-password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Bearer token" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/>}
   </div>
   <button disabled={!name.trim()||!endpoint.trim()||busy==='add'||(authType==='bearer'&&(!token.trim()||!encryptionConfigured))} onClick={()=>void add()} className="mt-3 rounded-xl bg-violet-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{busy==='add'?t('Connecting…','در حال اتصال…'):t('Save and verify','ذخیره و تأیید')}</button>
  </section>
  <section className="space-y-3">
   <div className="flex items-center justify-between"><div><h3 className="font-bold text-white">{t('My MCP connections','اتصال‌های MCP من')}</h3><p className="text-[11px] text-slate-500">{servers.length} {t('servers','سرور')}</p></div><button onClick={()=>void act('refresh',load)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300"><RefreshCw className="h-3 w-3"/>{t('Refresh','تازه‌سازی')}</button></div>
   {servers.map(server=><article key={server.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold text-white">{server.name}</h4><p className="mt-1 break-all text-[10px] text-slate-500">{server.endpointUrl}</p><p className="mt-1 text-[10px] text-slate-400">{server.protocolVersion||'Protocol not negotiated'} · {(server.tools||[]).length} tools</p></div><span className={'rounded-full border px-2 py-1 text-[10px] '+(server.enabled?'border-emerald-500/30 bg-emerald-500/10 text-emerald-300':server.status==='error'?'border-red-500/30 bg-red-500/10 text-red-300':'border-slate-700 text-slate-400')}>{server.enabled?'Enabled':server.status}</span></div>
    {server.lastError&&<p className="mt-2 rounded-lg bg-red-500/5 p-2 text-xs text-red-300">{server.lastError}</p>}
    {(server.tools||[]).length>0&&<details className="mt-3"><summary className="cursor-pointer text-xs text-violet-300">{t('View verified tools','نمایش ابزارهای تأییدشده')}</summary><div className="mt-2 flex flex-wrap gap-1.5">{server.tools.map(tool=><span key={tool.name} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"><Wrench className="mr-1 inline h-3 w-3"/>{tool.name}</span>)}</div></details>}
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy===server.id} onClick={()=>void verify(server)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-200"><Activity className="h-3 w-3"/>{t('Verify tools','تأیید ابزارها')}</button>{server.status==='verified'&&<button disabled={busy===server.id} onClick={()=>void toggle(server)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-200"><Power className="h-3 w-3"/>{server.enabled?t('Disable','غیرفعال‌سازی'):t('Enable','فعال‌سازی')}</button>}<button disabled={busy===server.id} onClick={()=>remove(server)} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 text-[11px] text-red-300"><Trash2 className="h-3 w-3"/>{t('Delete','حذف')}</button></div>
   </article>)}
   {!servers.length&&<p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">{t('No remote MCP servers connected yet.','هنوز سرور Remote MCP وصل نشده است.')}</p>}
  </section>
  <section className="space-y-3">
   <div className="flex items-center gap-2"><h3 className="font-bold text-white">{t('Public APIs MCP directory','فهرست MCP سایت Public APIs')}</h3><span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{directory.length}</span></div>
   <div className="grid gap-3 md:grid-cols-2">
    {directory.map(item=><article key={item.slug} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
     <div className="flex items-start justify-between gap-2"><div><h4 className="text-sm font-bold text-white">{item.name}</h4><p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p></div><span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] text-slate-400">{item.auth_type}</span></div>
     <div className="mt-2 flex flex-wrap gap-1">{(item.transports||[]).map(mode=><span key={mode} className="rounded bg-slate-800 px-2 py-1 text-[9px] text-slate-300">{mode}</span>)}</div>
     <div className="mt-3 flex flex-wrap gap-3 text-[11px]"><a href={item.website_url||item.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-cyan-300">{t('Website / details','وب‌سایت / جزئیات')}<ExternalLink className="h-3 w-3"/></a>{item.install_url&&<a href={item.install_url} target="_blank" rel="noreferrer noopener" className="text-slate-300">{t('Install instructions','راهنمای نصب')}</a>}<button onClick={()=>choose(item)} className="text-violet-300">{t('Use connection form','استفاده از فرم اتصال')}</button></div>
     {item.endpoint_url&&<p className="mt-2 break-all text-[10px] text-slate-500">{item.endpoint_url}</p>}
    </article>)}
   </div>
  </section>
 </div>;
};
