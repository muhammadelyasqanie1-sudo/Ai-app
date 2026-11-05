import React,{useCallback,useEffect,useState} from 'react';
import {Activity,CheckCircle2,Code2,Power,RefreshCw,Trash2,Wrench} from 'lucide-react';
import type {Language} from '../../types/afg';
type OpenApiSelection={name:string;toolName:string;description:string;endpointUrl:string;method:string;inputSchema:any;authOptions:string[]};
type Connector={id:string;catalogSourceKey:string|null;name:string;toolName:string;description:string;endpointUrl:string;httpMethod:string;authType:string;authHeaderName:string;hasCredential:boolean;inputSchema:any;sampleArguments:any;fallbackGroup:string;fallbackPriority:number;queueState:string;nextAvailableAt:string|null;enabled:boolean;status:string;lastTestedAt:string|null;lastHttpStatus:number|null;lastError:string|null};
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('afg_csrf='))?.slice(9)||'');
async function request(path:string,init:RequestInit={}){
 const headers=new Headers(init.headers||{});if(init.body!==undefined)headers.set('Content-Type','application/json');
 if(init.method&&init.method.toUpperCase()!=='GET')headers.set('X-CSRF-Token',csrf());
 const response=await fetch(path,{...init,headers,credentials:'include',cache:'no-store'});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||('HTTP '+response.status));return data;
}
export const AfgApiConnectorPanel:React.FC<{language:Language;catalogSelection?:{source_key:string;name:string;description:string;auth:string;docs_url:string|null;homepage_url:string|null}|null;openApiSelection?:OpenApiSelection|null}>=({language,catalogSelection=null,openApiSelection=null})=>{
 const dari=language==='dari'||language==='persian',t=(en:string,fa:string)=>dari?fa:en;
 const [rows,setRows]=useState<Connector[]>([]);
 const [encryption,setEncryption]=useState(false);
 const [name,setName]=useState('');const [toolName,setToolName]=useState('');
 const [description,setDescription]=useState('');const [endpoint,setEndpoint]=useState('');
 const [method,setMethod]=useState('GET');const [authType,setAuthType]=useState('none');
 const [authHeader,setAuthHeader]=useState('X-API-Key');const [credential,setCredential]=useState('');
 const [fallbackGroup,setFallbackGroup]=useState('');const [fallbackPriority,setFallbackPriority]=useState('100');
 const [schema,setSchema]=useState('{"type":"object","properties":{},"required":[],"additionalProperties":false}');
 const [sample,setSample]=useState('{}');const [sourceKey,setSourceKey]=useState('');
 const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [argumentsJson,setArgumentsJson]=useState<Record<string,string>>({});
 useEffect(()=>{if(!catalogSelection)return;setName(catalogSelection.name.slice(0,120));setToolName(catalogSelection.name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,64)||'api_tool');setDescription(catalogSelection.description.slice(0,1000));setSourceKey(catalogSelection.source_key);setEndpoint('');setCredential('');setAuthType(/api.?key|key/i.test(catalogSelection.auth)?'header_key':/basic/i.test(catalogSelection.auth)?'basic':/oauth|bearer/i.test(catalogSelection.auth)?'bearer':'none');setAuthHeader('X-API-Key');setFallbackGroup('');setFallbackPriority('100');},[catalogSelection]);
 useEffect(()=>{if(!openApiSelection)return;setName(openApiSelection.name.slice(0,120));setToolName(openApiSelection.toolName);setDescription(openApiSelection.description.slice(0,1000));setEndpoint(openApiSelection.endpointUrl);setMethod(openApiSelection.method);setSchema(JSON.stringify(openApiSelection.inputSchema,null,2));setSample('{}');setSourceKey('');setCredential('');const auth=openApiSelection.authOptions[0]||'none';if(auth==='bearer'){setAuthType('bearer');setAuthHeader('Authorization');}else if(auth==='basic'){setAuthType('basic');setAuthHeader('Authorization');}else if(auth.startsWith('header_key:')){setAuthType('header_key');setAuthHeader(auth.slice(11)||'X-API-Key');}else if(auth.startsWith('query_key:')){setAuthType('query_key');setAuthHeader(auth.slice(10)||'api_key');}else{setAuthType('none');setAuthHeader('X-API-Key');}setFallbackGroup('');setFallbackPriority('100');},[openApiSelection]);
 const [results,setResults]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{const data=await request('/api/api-hub/connectors');setRows(data.connectors||[]);setEncryption(Boolean(data.encryptionConfigured));},[]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Could not load connectors.'));},[load]);
 const act=async(key:string,fn:()=>Promise<any>)=>{setBusy(key);setError('');setNotice('');try{const result=await fn();setNotice(result?.verified?t('API connection verified.','اتصال API تأیید شد.'):t('Saved.','ذخیره شد.'));await load();return result;}catch(e){setError(e instanceof Error?e.message:'API connector operation failed.');await load().catch(()=>{});return null;}finally{setBusy('');}};
 const add=()=>act('add',async()=>{
  let inputSchema:any,sampleArguments:any;
  try{inputSchema=JSON.parse(schema);sampleArguments=JSON.parse(sample);}catch{throw new Error('Schema and sample arguments must be valid JSON.');}
  const result=await request('/api/api-hub/connectors',{method:'POST',body:JSON.stringify({
   name,toolName,description,endpointUrl:endpoint,method,authType,authHeaderName:authHeader,
   credential:authType==='none'?'':credential,inputSchema,sampleArguments,catalogSourceKey:sourceKey||null,
   fallbackGroup:fallbackGroup.trim(),fallbackPriority:Number(fallbackPriority)||100
  })});
  setName('');setToolName('');setDescription('');setEndpoint('');setCredential('');setSourceKey('');setFallbackGroup('');setFallbackPriority('100');
  return request('/api/api-hub/connectors/'+result.connector.id+'/test',{method:'POST',body:'{}'});
 });
 const verify=(row:Connector)=>act(row.id,()=>request('/api/api-hub/connectors/'+row.id+'/test',{method:'POST',body:'{}'}));
 const toggle=(row:Connector)=>act(row.id,()=>request('/api/api-hub/connectors/'+row.id,{method:'PATCH',body:JSON.stringify({enabled:!row.enabled})}));
 const remove=(row:Connector)=>{if(!window.confirm(t('Delete this connector and its encrypted API credential?','این اتصال و کلید رمزگذاری‌شده API حذف شود؟')))return;void act(row.id,()=>request('/api/api-hub/connectors/'+row.id,{method:'DELETE'}));};
 const call=(row:Connector)=>act('call-'+row.id,async()=>{
  let args:any;try{args=JSON.parse(argumentsJson[row.id]||'{}');}catch{throw new Error('Tool arguments must be valid JSON.');}
  const result=await request('/api/api-hub/connectors/'+row.id+'/call',{method:'POST',body:JSON.stringify({arguments:args})});
  setResults(prev=>({...prev,[row.id]:JSON.stringify(result.result,null,2)}));
  return result;
 });
 const field='w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500';
 return <section className="space-y-4 rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 sm:p-5">
  <div className="flex items-start gap-3"><div className="rounded-xl border border-cyan-400/30 bg-slate-900 p-2"><Wrench className="h-5 w-5 text-cyan-300"/></div><div><h2 className="font-black text-white">{t('My API connectors & AI tools','اتصال‌های API و ابزارهای هوشمند من')}</h2><p className="mt-1 text-xs leading-5 text-slate-400">{t('Turn a documented API endpoint into a secured server-side tool. Configure parameters with a JSON Schema, test it, then enable it for this account.','یک endpoint مستند API را به ابزار امن سمت سرور تبدیل کنید. پارامترها را با JSON Schema تعریف، آزمایش و سپس برای حساب خود فعال کنید.')}</p></div></div>
  <p className={'text-[11px] '+(encryption?'text-emerald-300':'text-amber-300')}>{encryption?t('Credential encryption is configured.','رمزگذاری کلیدها فعال است.'):t('Configure AFG_INTEGRATION_ENCRYPTION_KEY before adding API keys.','پیش از افزودن کلید API، متغیر AFG_INTEGRATION_ENCRYPTION_KEY را تنظیم کنید.')}</p>
  {error&&<div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{error}</div>}
  {notice&&<div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">{notice}</div>}
  <details className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" open={rows.length===0||Boolean(catalogSelection)}>
   <summary className="cursor-pointer text-sm font-bold text-white">{t('Create API tool','ساخت ابزار API')}</summary>
   <div className="mt-3 grid gap-2 sm:grid-cols-2">
    <input className={field} value={name} onChange={e=>setName(e.target.value)} placeholder={t('Display name','نام نمایشی')}/>
    <input className={field} value={toolName} onChange={e=>setToolName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_'))} placeholder="tool_name"/>
    <input className={field+' sm:col-span-2'} value={description} onChange={e=>setDescription(e.target.value)} placeholder={t('What this tool does and when the AI should use it','شرح ابزار و زمان استفاده هوش مصنوعی')}/>
    <input className={field+' sm:col-span-2'} value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://api.example.com/v1/resource/{id}"/>
    <select className={field} value={method} onChange={e=>setMethod(e.target.value)}>{['GET','POST','PUT','PATCH','DELETE'].map(x=><option key={x}>{x}</option>)}</select>
    <select className={field} value={authType} onChange={e=>setAuthType(e.target.value)}><option value="none">{t('No authentication','بدون احراز هویت')}</option><option value="bearer">Bearer token</option><option value="basic">HTTP Basic (username:password)</option><option value="header_key">API key header (X-API-Key / X-Mashape-Key)</option><option value="query_key">API key query parameter</option></select>
    {(authType==='header_key'||authType==='query_key')&&<input className={field} value={authHeader} onChange={e=>setAuthHeader(e.target.value)} placeholder={authType==='query_key'?'api_key':'X-API-Key'}/>}
    {authType!=='none'&&<input className={field} type="password" autoComplete="new-password" value={credential} onChange={e=>setCredential(e.target.value)} placeholder={authType==='basic'?'username:password':t('API credential','کلید یا توکن API')}/>}
    <input className={field+' sm:col-span-2'} value={sourceKey} onChange={e=>setSourceKey(e.target.value)} placeholder={t('Optional Public APIs catalog source key','کلید اختیاری ورودی کاتالوگ Public APIs')}/>
    <input className={field} value={fallbackGroup} onChange={e=>setFallbackGroup(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,''))} placeholder={t('Fallback group (e.g. weather)','گروه جایگزین (مثلاً weather)')}/>
    <input className={field} type="number" min="1" max="1000" value={fallbackPriority} onChange={e=>setFallbackPriority(e.target.value)} placeholder={t('Priority: lower runs first','اولویت: عدد کمتر زودتر اجرا می‌شود')}/>
    <p className="text-[10px] leading-4 text-slate-500 sm:col-span-2">{t('Give compatible APIs the same fallback group and matching parameter schema. When one provider is rate-limited or temporarily unavailable, the next verified connector is tried.','به APIهای هم‌کاربرد گروه یکسان و schema پارامتر یکسان بدهید. اگر سرویس محدود یا موقتاً قطع شد، اتصال تأییدشده بعدی امتحان می‌شود.')}</p>
    <label className="text-[11px] text-slate-400 sm:col-span-2">{t('Parameter JSON Schema','JSON Schema پارامترها')}<textarea className={field+' mt-1 min-h-32 font-mono'} value={schema} onChange={e=>setSchema(e.target.value)}/></label>
    <label className="text-[11px] text-slate-400 sm:col-span-2">{t('Sample arguments used for verification','نمونه پارامترهای آزمایش اتصال')}<textarea className={field+' mt-1 min-h-20 font-mono'} value={sample} onChange={e=>setSample(e.target.value)}/></label>
   </div>
   <button disabled={busy==='add'||!name.trim()||!toolName.trim()||!endpoint.trim()||(authType!=='none'&&(!credential.trim()||!encryption))} onClick={()=>void add()} className="mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{busy==='add'?t('Saving and testing…','در حال ذخیره و آزمایش…'):t('Save and test API','ذخیره و آزمایش API')}</button>
  </details>
  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">{t('Configured connectors','اتصال‌های پیکربندی‌شده')} ({rows.length})</h3><button onClick={()=>void act('refresh',load)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300"><RefreshCw className="h-3 w-3"/>{t('Refresh','تازه‌سازی')}</button></div>
  {rows.map(row=><article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
   <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold text-white">{row.name} <span className="ml-1 font-mono text-[10px] text-cyan-300">{row.toolName}</span></h4><p className="mt-1 break-all text-[10px] text-slate-500">{row.httpMethod} {row.endpointUrl}</p><p className="mt-1 text-[10px] text-slate-400">{row.description}</p>{row.fallbackGroup&&<p className="mt-1 text-[10px] text-violet-300">Fallback: {row.fallbackGroup} · Priority {row.fallbackPriority}</p>}</div><span className={'rounded-full border px-2 py-1 text-[10px] '+(row.enabled?'border-emerald-500/30 text-emerald-300':row.status==='error'?'border-red-500/30 text-red-300':'border-slate-700 text-slate-400')}>{row.queueState==='waiting'?t('Waiting for quota reset','در صف انتظار تمدید سهمیه'):row.enabled?t('Enabled','فعال'):row.status}</span></div>{row.nextAvailableAt&&<p className="mt-1 text-[10px] text-amber-300">{t('Next eligible time: ','زمان بازگشت به صف: ')}{new Date(row.nextAvailableAt).toLocaleString()}</p>}
   {row.lastError&&<p className="mt-2 text-xs text-red-300">{row.lastError}</p>}
   <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>void verify(row)} disabled={busy===row.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-slate-300"><Activity className="h-3 w-3"/>Test</button>{row.status==='verified'&&<button onClick={()=>void toggle(row)} disabled={busy===row.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-slate-300"><Power className="h-3 w-3"/>{row.enabled?'Disable':'Enable'}</button>}<button onClick={()=>remove(row)} disabled={busy===row.id} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 text-[10px] text-red-300"><Trash2 className="h-3 w-3"/>Delete</button></div>
   {row.enabled&&<div className="mt-3 grid gap-2"><textarea value={argumentsJson[row.id]||JSON.stringify(row.sampleArguments||{},null,2)} onChange={e=>setArgumentsJson(v=>({...v,[row.id]:e.target.value}))} rows={3} className={field+' font-mono'} placeholder="{}"/><button onClick={()=>void call(row)} disabled={busy==='call-'+row.id} className="inline-flex w-fit items-center gap-1 rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-bold text-slate-950"><Code2 className="h-3 w-3"/>Run tool</button>{results[row.id]&&<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-[10px] text-emerald-200">{results[row.id]}</pre>}</div>}
  </article>)}
  {!rows.length&&<p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">{t('No API connectors configured.','هنوز اتصال API ساخته نشده است.')}</p>}
  <p className="text-[10px] leading-5 text-slate-500">{t('Only endpoints you configure are callable. Credentials remain server-side; each connection is owner-scoped, verified before activation and rate-limited. Generic tool execution is available through this API connector panel; automatic chat tool orchestration is a separate integration milestone.','فقط endpointهایی اجرا می‌شوند که خودتان پیکربندی کنید. اعتبارنامه‌ها در سرور می‌مانند؛ اتصال‌ها مخصوص مالک، نیازمند تأیید و دارای محدودیت مصرف هستند. اجرای مستقیم ابزار موجود است؛ اتصال خودکار ابزارها به جریان گفتگو مرحله جداگانه است.')}</p>
 </section>;
};
