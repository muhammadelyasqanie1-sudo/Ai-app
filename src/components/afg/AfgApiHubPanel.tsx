import React,{useCallback,useEffect,useMemo,useState} from 'react';
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, Database, Globe, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { Language } from '../../types/afg';
import { AfgApiConnectorPanel } from './AfgApiConnectorPanel.tsx';

type CatalogItem={source_key:string;name:string;description:string;auth:string;https:string;cors:string;category:string;capability?:string;implementation_status?:string;homepage_url:string|null;docs_url:string|null;icon_url:string|null;image_url:string|null;site_name:string|null;site_description:string|null;health_status:string;response_time_ms:number|null;last_health_check:string|null};
type CatalogResponse={items:CatalogItem[];page:number;pageSize:number;total:number;categories:Array<{category:string;count:number}>};
type SyncState={configured?:boolean;sync?:{status:string;items_imported:number;pages_fetched:number;repository_readme_ok?:boolean;directory_api_ok?:boolean;last_started_at:string|null;last_completed_at:string|null;last_error:string|null}|null;implementationTracking?:{configured:boolean;total:number;byStatus:Record<string,number>};mcpDirectory?:{total:number}};
type Provider={id:string;displayName:string;configured:boolean;enabled:boolean};
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('afg_csrf='))?.slice(9)||'');
async function request(path:string,init:RequestInit={}){
 const headers=new Headers(init.headers||{});
 if(init.body!==undefined)headers.set('Content-Type','application/json');
 if(init.method&&init.method.toUpperCase()!=='GET')headers.set('X-CSRF-Token',csrf());
 const response=await fetch(path,{...init,headers,credentials:'include',cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||('HTTP '+response.status));
 return data;
}
const pill='inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold';
const capabilityLabel=(value?:string)=>({ai:'AI & language',image:'Image',coding:'Coding',weather:'Weather',finance:'Finance',maps:'Maps & location',news:'News & media',food:'Food & nutrition',general:'General'}[value||'general']||'General');
export const AfgApiHubPanel:React.FC<{language:Language;adminMode?:boolean;canSync?:boolean}>=({language,adminMode=false,canSync=false})=>{
 const dari=language==='dari'||language==='persian';
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [auth,setAuth]=useState('all');
 const [https,setHttps]=useState('all');
 const [cors,setCors]=useState('all');
 const [page,setPage]=useState(1);
 const [data,setData]=useState<CatalogResponse|null>(null);
 const [sync,setSync]=useState<SyncState|null>(null);
 const [gateway,setGateway]=useState<Provider|null>(null);
 const [favoriteKeys,setFavoriteKeys]=useState<string[]>([]);
 const [selectedDetails,setSelectedDetails]=useState<any>(null);
 const [randomItem,setRandomItem]=useState<CatalogItem|null>(null);
 const [connectorSelection,setConnectorSelection]=useState<CatalogItem|null>(null);
 const [openApiUrl,setOpenApiUrl]=useState('');
 const [openApiSourceKey,setOpenApiSourceKey]=useState<string|null>(null);
 const [openApiResult,setOpenApiResult]=useState<any>(null);
 const [openApiSelection,setOpenApiSelection]=useState<any>(null);
 const [bulkImporting,setBulkImporting]=useState(false);
 const [bulkSelected,setBulkSelected]=useState<string[]>([]);
 const [discovering,setDiscovering]=useState(false);
 const [loading,setLoading]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [queue,setQueue]=useState<{queued:number;claimed:number;done:number;blocked:number}>({queued:0,claimed:0,done:0,blocked:0});
 const [claimedItems,setClaimedItems]=useState<any[]>([]);
 const [queueBusy,setQueueBusy]=useState(false);
 const pageCount=useMemo(()=>Math.max(1,Math.ceil((data?.total||0)/(data?.pageSize||24))),[data]);
 const load=useCallback(async()=>{
   setLoading(true);setError('');
   try{
     const params=new URLSearchParams({q:query.trim(),category,auth,https,cors,page:String(page),pageSize:'24'});
     const results=await Promise.all([
       request('/api/api-hub/catalog?'+params.toString()),
       adminMode?request('/api/admin/api-hub/status').catch(()=>null):Promise.resolve(null),
       request('/api/admin/providers').catch(()=>null),
       request('/api/api-hub/favorites').catch(()=>({items:[]})),
     ]);
     setData(results[0] as CatalogResponse);
     setSync(results[1] as SyncState|null);
     const provider=(results[2]?.providers||[]).find((item:Provider)=>item.id==='9router');
     setGateway(provider||null);
     setFavoriteKeys((results[3]?.items||[]).map((item:CatalogItem)=>item.source_key));
   }catch(e){setError(e instanceof Error?e.message:'Could not load API catalog.');}
   finally{setLoading(false);}
 },[query,category,auth,https,cors,page,adminMode]);
 useEffect(()=>{void load();},[load]);
 const refreshQueue=async()=>{if(!adminMode)return;try{const result=await request('/api/admin/api-hub/work-queue');setQueue(result.counts||{queued:0,claimed:0,done:0,blocked:0});}catch(e){setError(e instanceof Error?e.message:'Queue status unavailable.');}};
 useEffect(()=>{void refreshQueue();},[adminMode]);
 const claimQueue=async()=>{setQueueBusy(true);setError('');try{const result=await request('/api/admin/api-hub/work-queue/claim',{method:'POST',body:JSON.stringify({limit:10})});setClaimedItems(result.claimed||[]);await refreshQueue();setNotice(label('Claimed '+(result.claimed||[]).length+' API entries for review.',''+(result.claimed||[]).length+' API برای بررسی گرفته شد.'));}catch(e){setError(e instanceof Error?e.message:'Could not claim queue items.');}finally{setQueueBusy(false);}};
 const discoverQueueDocs=async(item:any)=>{setQueueBusy(true);setError('');try{const result=await request('/api/admin/api-hub/work-queue/discover-docs',{method:'POST',body:JSON.stringify({sourceKey:item.source_key})});const evidence=result.evidence||{};await refreshQueue();const protocols=(evidence.protocolTypes||[]).join(', ')||'unknown';const authTypes=(evidence.authTypes||[]).join(', ')||'unknown';setNotice(label('Docs scanned: '+protocols+' · auth: '+authTypes+' · OpenAPI candidates: '+(evidence.openApiCandidates||[]).length,'مستندات بررسی شد: '+protocols+' · احراز هویت: '+authTypes+' · گزینه OpenAPI: '+(evidence.openApiCandidates||[]).length));}catch(e){setError(e instanceof Error?e.message:'Official docs discovery failed; the item remains available for review.');}finally{setQueueBusy(false);}};
 const discoverQueueContract=async(item:any)=>{setQueueBusy(true);setError('');try{const result=await request('/api/admin/api-hub/work-queue/discover-contract',{method:'POST',body:JSON.stringify({sourceKey:item.source_key})});const contract=result.contract||{};setClaimedItems(items=>items.filter(row=>row.source_key!==item.source_key));await refreshQueue();setNotice(label('OpenAPI contract extracted: '+(contract.operationCount||0)+' operations · '+(contract.tagGroups||[]).length+' groups. Endpoints are not yet verified or enabled.','قرارداد OpenAPI استخراج شد: '+(contract.operationCount||0)+' عملیات · '+(contract.tagGroups||[]).length+' گروه. endpointها هنوز تأیید یا فعال نشده‌اند.'));}catch(e){setError(e instanceof Error?e.message:'OpenAPI contract extraction failed. The item remains claimed for review.');}finally{setQueueBusy(false);}};
 const completeQueueItem=async(item:any,outcome:string)=>{setQueueBusy(true);setError('');try{const payload:any={sourceKey:item.source_key,outcome};if(outcome==='docs_discovered')payload.officialDocsUrl=window.prompt(label('Official HTTPS documentation URL','لینک رسمی HTTPS مستندات'))||'';if(outcome==='contract_discovered')payload.specUrl=window.prompt(label('OpenAPI JSON HTTPS URL','لینک HTTPS سند OpenAPI JSON'))||'';if(outcome==='unsupported')payload.reason=window.prompt(label('Reason this API cannot be integrated yet','دلیل عدم امکان اتصال فعلی'))||'';if(outcome==='retry')payload.reason='Needs another review';if((outcome==='docs_discovered'&&!payload.officialDocsUrl)||(outcome==='contract_discovered'&&!payload.specUrl)||(outcome==='unsupported'&&!payload.reason))return;await request('/api/admin/api-hub/work-queue/complete',{method:'POST',body:JSON.stringify(payload)});setClaimedItems(items=>items.filter(row=>row.source_key!==item.source_key));await refreshQueue();}catch(e){setError(e instanceof Error?e.message:'Could not update queue item.');}finally{setQueueBusy(false);}};
 const syncNow=async()=>{
   setRefreshing(true);setError('');setNotice('');
   try{
     const result=await request('/api/admin/api-hub/sync',{method:'POST',body:'{}'});
     const apiCount=Number(result.result?.catalog?.imported||0);const mcpCount=Number(result.result?.mcpDirectory?.imported||0);
     setNotice(dari?('همگام‌سازی تکمیل شد: '+apiCount+' API و '+mcpCount+' سرور MCP.'):('Synced '+apiCount+' APIs and '+mcpCount+' MCP servers from GitHub.'));
     setPage(1);
     await load();
     if(result.status==='partial')setNotice(dari?'همگام‌سازی ناقص بود؛ وضعیت را بررسی کنید.':'Catalog sync was partial; review the sync status.');
   }catch(e){setError(e instanceof Error?e.message:'Catalog sync failed.');}
   finally{setRefreshing(false);}
 };

 const toggleFavorite=async(item:CatalogItem)=>{
   setError('');
   try{
     if(favoriteKeys.includes(item.source_key)){
       await request('/api/api-hub/favorites/'+item.source_key,{method:'DELETE'});
       setFavoriteKeys(keys=>keys.filter(key=>key!==item.source_key));
       setNotice(label('Removed from favorites.','از علاقه‌مندی‌ها حذف شد.'));
     }else{
       await request('/api/api-hub/favorites',{method:'POST',body:JSON.stringify({sourceKey:item.source_key})});
       setFavoriteKeys(keys=>[...keys,item.source_key]);
       setNotice(label('Saved to favorites.','به علاقه‌مندی‌ها افزوده شد.'));
     }
   }catch(e){setError(e instanceof Error?e.message:'Could not update favorites.');}
 };
 const showDetails=async(item:CatalogItem)=>{
   setError('');setSelectedDetails(null);
   try{setSelectedDetails(await request('/api/api-hub/catalog/'+item.source_key));}
   catch(e){setError(e instanceof Error?e.message:'Could not load API details.');}
 };
 const surprise=async()=>{
   setError('');
   try{const result=await request('/api/api-hub/random?category='+encodeURIComponent(category));setRandomItem(result.item||null);}
   catch(e){setError(e instanceof Error?e.message:'Random discovery failed.');}
 };
 const discoverOpenApi=async()=>{setDiscovering(true);setError('');setNotice('');setOpenApiResult(null);setOpenApiSelection(null);setBulkSelected([]);try{const result=await request('/api/api-hub/openapi/discover',{method:'POST',body:JSON.stringify({specUrl:openApiUrl.trim(),sourceKey:openApiSourceKey})});setOpenApiResult(result);setNotice(label('OpenAPI operations discovered. Select an operation to configure it.','عملیات OpenAPI پیدا شد؛ یک عملیات را برای تنظیم انتخاب کنید.'));}catch(e){setError(e instanceof Error?e.message:'OpenAPI discovery failed.');}finally{setDiscovering(false);}};
 const importSelectedSafe=async()=>{
  if(!openApiResult||!bulkSelected.length)return;
  setBulkImporting(true);setError('');let added=0,failed=0;
  for(const key of bulkSelected){
   const index=Number(key);const op=openApiResult.operations?.[index];if(!op)continue;
   try{
    const result=await request('/api/api-hub/connectors',{method:'POST',body:JSON.stringify({name:String(op.name||op.toolName).slice(0,120),toolName:op.toolName,description:op.description||'Imported from OpenAPI',endpointUrl:op.endpointUrl,method:'GET',authType:'none',authHeaderName:'X-API-Key',credential:'',inputSchema:op.inputSchema,sampleArguments:{},catalogSourceKey:openApiSourceKey,fallbackGroup:'',fallbackPriority:100})});
    added++;
    try{await request('/api/api-hub/connectors/'+result.connector.id+'/test',{method:'POST',body:'{}'});}catch{failed++;}
   }catch{failed++;}
  }
  setBulkSelected([]);setBulkImporting(false);
  setNotice(label('Imported '+added+' safe GET connectors; '+failed+' need review. They remain disabled until verified.',''+added+' اتصال GET وارد شد؛ '+failed+' مورد نیازمند بررسی است. تا تأیید غیرفعال می‌مانند.'));
 };
 const update=(setter:(value:string)=>void)=>(value:string)=>{setter(value);setPage(1);};
 const label=(en:string,fa:string)=>dari?fa:en;
 return <div className="space-y-4">
  <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex items-start gap-3"><div className="rounded-xl border border-cyan-400/30 bg-slate-950 p-2"><Database className="h-5 w-5 text-cyan-300"/></div><div><h2 className="text-lg font-black text-white">{label('Universal API Hub','مرکز یکپارچه API')}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{label('Discover and filter the complete Public APIs directory. Entries are metadata until their official API contract and credentials are configured.','تمام فهرست Public APIs را جستجو و دسته‌بندی کنید. هر ورودی تا زمان تأیید مستندات و تنظیم اتصال، فقط اطلاعات کاتالوگ است.')}</p></div></div>
    {canSync&&<button disabled={refreshing} onClick={()=>void syncNow()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><RefreshCw className={'h-4 w-4 '+(refreshing?'animate-spin':'')}/>{label('Sync catalog','همگام‌سازی فهرست')}</button>}
   </div>
   <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
    <a href="https://github.com/public-apis/public-apis" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">GitHub source ↗</a>
    <a href="https://publicapis.lol/no-api-key" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">No API key ↗</a>
    <a href="https://publicapis.lol/trending" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">Trending ↗</a>
    <a href="https://publicapis.lol/status" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">Daily status ↗</a>
    <a href="https://publicapis.lol/mcp" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">MCP directory ↗</a>
    <a href="https://publicapis.lol/tools" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">Developer tools ↗</a>
    <a href="https://publicapis.lol/llms.txt" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">llms.txt ↗</a>
    <a href="https://publicapis.lol/rss.xml" target="_blank" rel="noreferrer noopener" className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-slate-300">RSS ↗</a>
   </div>
   <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Catalog entries','تعداد APIها')}</p><b className="text-xl text-white">{(data?.total||0).toLocaleString()}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Categories','دسته‌ها')}</p><b className="text-xl text-white">{(data?.categories?.length||0).toLocaleString()}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('MCP servers','سرورهای MCP')}</p><b className="text-xl text-white">{(sync?.mcpDirectory?.total||0).toLocaleString()}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Catalog sync','وضعیت همگام‌سازی')}</p><b className="text-sm text-white">{sync?.sync?.status||'—'}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Implementation progress','پیشرفت پیاده‌سازی')}</p><b className="text-sm text-white">{sync?.implementationTracking?.configured?(sync.implementationTracking.byStatus.contract_discovered||0)+'/'+sync.implementationTracking.total:label('Migration needed','نیازمند مهاجرت')}</b><p className="mt-1 text-[9px] text-slate-500">{label('Contracts discovered','قراردادهای شناسایی‌شده')}</p></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">9Router Gateway</p><b className={'text-sm '+(gateway?.configured?'text-emerald-300':'text-amber-300')}>{gateway?.configured?label('Configured','تنظیم شده'):label('Not configured','تنظیم نشده')}</b></div>
   </div>
   {sync?.sync&&<p className="mt-3 text-[10px] text-slate-400">{label('Source coverage','پوشش منابع')}: GitHub README {sync.sync.repository_readme_ok? '✓':'—'} · publicapis.lol {sync.sync.directory_api_ok?'✓':'—'} · {label('Imported','واردشده')}: {sync.sync.items_imported||0}</p>}
   {sync?.implementationTracking?.configured&&<p className="mt-1 text-[10px] text-slate-400">{label('Not yet implemented','هنوز پیاده‌سازی نشده')}: {sync.implementationTracking.byStatus.catalogued||0} · {label('Docs found','مستندات پیدا شده')}: {sync.implementationTracking.byStatus.docs_discovered||0} · {label('Contract found','قرارداد API پیدا شده')}: {sync.implementationTracking.byStatus.contract_discovered||0}  · {label('Unsupported','فعلاً پشتیبانی‌نشده')}: {sync.implementationTracking.byStatus.unsupported||0}</p>}
   {!sync?.implementationTracking?.configured&&adminMode&&<p className="mt-2 text-[10px] text-amber-300">{label('Apply migration 0024 to enable per-API implementation tracking.','برای فعال‌شدن پیگیری جداگانه هر API، مهاجرت 0024 را اجرا کنید.')}</p>}
   {sync?.sync?.last_error&&<p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300">{sync.sync.last_error}</p>}
   {!gateway?.configured&&<p className="mt-3 text-[11px] text-slate-400">{label('Set NINEROUTER_BASE_URL on the server; NINEROUTER_API_KEY is optional when 9Router authentication is disabled. Apply migrations 0012–0015.','NINEROUTER_BASE_URL را فقط در سرور تنظیم کنید؛ NINEROUTER_API_KEY فقط در صورت فعال‌بودن احراز هویت 9Router لازم است. مهاجرت‌های 0012 تا 0015 را اجرا کنید.')}</p>}
  </section>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">{notice}</div>}
  {adminMode&&<section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-white">{label('API discovery work queue','صف بررسی و شناسایی APIها')}</h3><p className="mt-1 text-xs text-slate-400">{label('Claim a small batch, verify official docs/contracts, then record the result. Unfinished items remain queued; expired claims return automatically.','یک دسته کوچک بگیر، مستندات و قرارداد رسمی را بررسی کن و نتیجه را ثبت کن. موارد ناتمام در صف می‌مانند.')}</p></div><button disabled={queueBusy} onClick={()=>void claimQueue()} className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{queueBusy?label('Working…','در حال اجرا…'):label('Claim next 10','گرفتن ۱۰ مورد بعدی')}</button></div>
   <div className="mt-3 grid grid-cols-4 gap-2 text-center">{[['queued',label('Queued','در صف')],['claimed',label('In review','در بررسی')],['done',label('Reviewed','بررسی‌شده')],['blocked',label('Blocked','مسدود')]].map(([key,title])=><div key={key} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2"><b className="text-lg text-white">{queue[key as keyof typeof queue]||0}</b><p className="text-[10px] text-slate-400">{title}</p></div>)}</div>
   {claimedItems.length>0&&<div className="mt-3 space-y-2">{claimedItems.map(item=><div key={item.source_key} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3"><p className="text-xs font-bold text-white">{item.name}</p><p className="mt-1 text-[10px] text-slate-400">{item.category} · {item.auth}</p><p className="mt-1 break-all text-[10px] text-slate-500">{item.docs_url||item.homepage_url||label('No official docs URL in catalogue','لینک رسمی در فهرست موجود نیست')}</p><div className="mt-2 flex flex-wrap gap-2"><button disabled={queueBusy||!(item.docs_url||item.homepage_url)} onClick={()=>void discoverQueueDocs(item)} className="rounded-lg border border-emerald-500/30 px-2 py-1.5 text-[10px] text-emerald-200">{label('Auto-scan official docs','بررسی خودکار مستندات رسمی')}</button><button disabled={queueBusy} onClick={()=>void discoverQueueContract(item)} className="rounded-lg border border-violet-500/30 px-2 py-1.5 text-[10px] text-violet-200">{label('Extract OpenAPI contract','استخراج قرارداد OpenAPI')}</button><button disabled={queueBusy} onClick={()=>void completeQueueItem(item,'docs_discovered')} className="rounded-lg border border-cyan-500/30 px-2 py-1.5 text-[10px] text-cyan-200">{label('Docs verified','مستندات تأیید شد')}</button><button disabled={queueBusy} onClick={()=>void completeQueueItem(item,'contract_discovered')} className="rounded-lg border border-violet-500/30 px-2 py-1.5 text-[10px] text-violet-200">{label('OpenAPI contract found','قرارداد OpenAPI پیدا شد')}</button><button disabled={queueBusy} onClick={()=>void completeQueueItem(item,'unsupported')} className="rounded-lg border border-rose-500/30 px-2 py-1.5 text-[10px] text-rose-200">{label('Unsupported','پشتیبانی‌نشده')}</button><button disabled={queueBusy} onClick={()=>void completeQueueItem(item,'retry')} className="rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300">{label('Return to queue','بازگشت به صف')}</button></div></div>)}</div>}
  </section>}
  <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
   <h3 className="font-bold text-white">{label('Import operations from OpenAPI','واردکردن عملیات از OpenAPI')}</h3>
   <p className="mt-1 text-xs leading-5 text-slate-400">{label('Paste a public HTTPS URL to an OpenAPI 3.0/3.1 JSON document. This discovers operations only; it does not execute them or provide credentials.','نشانی HTTPS عمومی سند JSON استاندارد OpenAPI 3 را وارد کنید. این بخش فقط عملیات را شناسایی می‌کند و آن‌ها را اجرا یا کلید دسترسی ایجاد نمی‌کند.')}</p>
   <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={openApiUrl} onChange={e=>{setOpenApiUrl(e.target.value);setOpenApiSourceKey(null);}} placeholder="https://api.example.com/openapi.json" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"/><button disabled={discovering||!openApiUrl.trim()} onClick={()=>void discoverOpenApi()} className="rounded-xl bg-violet-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{discovering?label('Discovering…','در حال شناسایی…'):label('Discover operations','شناسایی عملیات')}</button></div>
   {openApiResult&&<div className="mt-3 space-y-2"><p className="text-xs text-violet-200">{openApiResult.specTitle} · {openApiResult.operationCount} {label('operations found','عملیات پیدا شد')}</p><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{label('Bulk import: no-auth GET operations with no required parameters only.','واردسازی گروهی: فقط GET بدون کلید و بدون پارامتر اجباری.')}</span><button disabled={bulkImporting||!bulkSelected.length} onClick={()=>void importSelectedSafe()} className="rounded-lg bg-violet-400 px-3 py-2 text-[10px] font-bold text-slate-950 disabled:opacity-40">{bulkImporting?label('Importing…','در حال واردسازی…'):label('Import selected ('+bulkSelected.length+')','واردسازی انتخاب‌شده‌ها ('+bulkSelected.length+')')}</button></div>{(openApiResult.operations||[]).map((operation:any,index:number)=>{const safe=operation.usable&&operation.method==='GET'&&(operation.authOptions||[]).every((item:string)=>item==='none')&&!(operation.inputSchema?.required||[]).length;return <div key={operation.toolName+'_'+index} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-2"><input type="checkbox" checked={bulkSelected.includes(String(index))} disabled={!safe||bulkImporting} onChange={event=>setBulkSelected(values=>event.target.checked?[...values,String(index)]:values.filter(value=>value!==String(index)))} className="mt-1 accent-violet-400"/><div className="min-w-0"><p className="text-xs font-semibold text-white">{operation.method} {operation.name}</p><p className="mt-1 break-all text-[10px] text-slate-500">{operation.endpointUrl}</p><p className="mt-1 text-[10px] text-slate-400">{label('Auth','احراز هویت')}: {(operation.authOptions||[]).join(', ')} · {safe?label('Safe for bulk import','مناسب واردسازی گروهی'):label('Manual setup required','نیازمند تنظیم دستی')}</p></div></div><button disabled={!operation.usable} onClick={()=>{setOpenApiSelection(operation);setConnectorSelection(null);setNotice(label('Operation loaded into connector setup.','عملیات به فرم تنظیم اتصال منتقل شد.'));}} className="shrink-0 rounded-lg border border-violet-400/30 px-3 py-2 text-[10px] text-violet-200 disabled:opacity-40">{label('Configure','تنظیم')}</button></div>})}</div>}
   <p className="mt-2 text-[10px] text-slate-500">{label('JSON only in this milestone. YAML, OAuth authorization flows, remote schema references and complex nested request bodies are not imported.','در این مرحله فقط JSON پشتیبانی می‌شود؛ YAML، جریان OAuth، ارجاع‌های خارجی و بدنه‌های پیچیده وارد نمی‌شوند.')}</p>
  </section>
  <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
   <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
    <div className="relative sm:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder={label('Search APIs','جستجوی API')} className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white"/></div>
    <select value={category} onChange={e=>update(setCategory)(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="all">{label('All categories','همه دسته‌ها')}</option>{(data?.categories||[]).map(item=><option key={item.category} value={item.category}>{item.category} ({item.count})</option>)}</select>
    <select value={auth} onChange={e=>update(setAuth)(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="all">{label('Any authentication','هر نوع احراز هویت')}</option><option value="No">No auth</option><option value="apiKey">API key</option><option value="OAuth">OAuth</option></select>
    <select value={https} onChange={e=>update(setHttps)(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="all">HTTPS: any</option><option value="true">HTTPS: Yes</option><option value="false">HTTPS: No</option></select>
    <select value={cors} onChange={e=>update(setCors)(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="all">CORS: any</option><option value="true">CORS: Yes</option><option value="false">CORS: No</option></select>
   </div>
  </section>
  <div className="flex flex-wrap items-center gap-2">
   <button onClick={()=>void surprise()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200"><Sparkles className="h-3.5 w-3.5"/>{label('Surprise me','یک API تصادفی')}</button>
   <button onClick={()=>{setAuth('No');setPage(1);}} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300">{label('No-auth APIs','APIهای بدون کلید')}</button>
   <span className="text-[11px] text-slate-500">{favoriteKeys.length} {label('saved APIs','API ذخیره‌شده')}</span>
  </div>
  {randomItem&&<article className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4"><div className="flex items-center justify-between"><b className="text-white">{label('Surprise API','API تصادفی')}: {randomItem.name}</b><button onClick={()=>setRandomItem(null)} className="text-xs text-slate-400">×</button></div><p className="mt-1 text-xs text-slate-400">{randomItem.description}</p><div className="mt-2 text-[10px] text-slate-300">{randomItem.category} · Auth: {randomItem.auth} · HTTPS: {randomItem.https}</div><button onClick={()=>void showDetails(randomItem)} className="mt-2 text-xs text-violet-300">{label('Details & alternatives','جزئیات و جایگزین‌ها')}</button></article>}
  {selectedDetails?.item&&<section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4"><div className="flex items-start justify-between"><div><p className="text-[10px] text-violet-300">{selectedDetails.item.category}</p><h3 className="font-bold text-white">{selectedDetails.item.name}</h3><p className="mt-1 text-xs text-slate-400">{selectedDetails.item.description}</p></div><button onClick={()=>setSelectedDetails(null)} className="text-slate-400">×</button></div><div className="mt-3"><b className="text-xs text-white">{label('Similar alternatives','گزینه‌های مشابه')}</b><div className="mt-2 flex flex-wrap gap-2">{(selectedDetails.alternatives||[]).map((alt:any)=><button key={alt.source_key} onClick={()=>void showDetails(alt)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-cyan-200">{alt.name}</button>)}</div></div>
   <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-xs text-white">{label('Discovered contract','قرارداد شناسایی‌شده')}</b><span className="text-[10px] text-violet-200">{selectedDetails.item.contract?.operationCount||0} {label('operations','عملیات')}</span></div>
    {(selectedDetails.item.protocol_types||[]).length>0&&<p className="mt-1 text-[10px] text-slate-400">Protocols: {selectedDetails.item.protocol_types.join(', ')}</p>}
    {(selectedDetails.item.auth_evidence||[]).length>0&&<p className="mt-1 text-[10px] text-slate-400">Auth evidence: {selectedDetails.item.auth_evidence.join(', ')}</p>}
    {selectedDetails.item.openapi_spec_url&&<p className="mt-1 break-all text-[10px] text-cyan-300">{selectedDetails.item.openapi_spec_url}</p>}
    {(selectedDetails.item.contract?.operations||[]).slice(0,12).map((operation:any,index:number)=><div key={operation.operationId||operation.toolName||index} className="mt-2 border-t border-slate-800 pt-2"><p className="text-[11px] font-semibold text-slate-200">{operation.method} · {operation.name}</p><p className="mt-0.5 break-all text-[10px] text-slate-500">{operation.endpointUrl}</p><div className="mt-1 flex flex-wrap gap-1">{(operation.tags||[]).map((tag:string)=><span key={tag} className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[9px] text-slate-400">{tag}</span>)}<span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[9px] text-slate-400">{operation.usable?'schema-supported':'manual review'}</span></div></div>)}
    {(selectedDetails.item.contract?.operationCount||0)>12&&<p className="mt-2 text-[10px] text-slate-500">{label('Showing first 12 operations.','۱۲ عملیات نخست نمایش داده شده است.')}</p>}
    {!selectedDetails.item.contract?.operationCount&&<p className="mt-1 text-[10px] text-slate-500">{label('No OpenAPI contract extracted yet.','هنوز قرارداد OpenAPI استخراج نشده است.')}</p>}
   </div>
  </section>}
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-400">{label('Showing','نمایش') } {(data?.items?.length||0)} / {(data?.total||0).toLocaleString()} {label('entries','مورد')}</p><button onClick={()=>void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300"><RefreshCw className="h-3 w-3"/>{label('Refresh','تازه‌سازی')}</button></div>
  {loading&&!data&&<div className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">{label('Loading catalog…','در حال بارگذاری فهرست…')}</div>}
  <div className="grid gap-3 md:grid-cols-2">
   {(data?.items||[]).map(item=><article key={item.source_key} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2">{item.icon_url&&<img src={item.icon_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-lg bg-slate-950 object-contain p-1"/>}<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{item.category}</p><span className={pill+' mt-1 border-cyan-500/20 text-cyan-200'}>{capabilityLabel(item.capability)}</span><h3 className="mt-1 truncate font-bold text-white">{item.name}</h3><p className="text-[10px] text-slate-500">{item.site_name||''}</p></div></div><div className="flex flex-wrap justify-end gap-1"><span className={pill+' border-slate-700 bg-slate-950 text-slate-300'}>{item.health_status||'unknown'}</span><span className={pill+' border-violet-500/30 bg-violet-500/5 text-violet-200'}>{(item.implementation_status||'catalogued').replaceAll('_',' ')}</span></div></div>
    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{item.description||label('No description supplied.','توضیحی ثبت نشده است.')}</p>
    <div className="mt-3 flex flex-wrap gap-1.5"><span className={pill+' border-slate-700 text-slate-300'}>Auth: {item.auth}</span><span className={pill+' border-slate-700 text-slate-300'}>HTTPS: {item.https}</span><span className={pill+' border-slate-700 text-slate-300'}>CORS: {item.cors}</span></div>
    <div className="mt-4 flex flex-wrap gap-3 text-xs">{item.docs_url&&<a className="inline-flex items-center gap-1 text-cyan-300 hover:underline" href={item.docs_url} target="_blank" rel="noreferrer noopener">{label('API Docs','مستندات API')}<ArrowUpRight className="h-3 w-3"/></a>}{item.docs_url&&<button onClick={()=>{setOpenApiUrl(item.docs_url||'');setOpenApiSourceKey(item.source_key);setOpenApiResult(null);setOpenApiSelection(null);setNotice(label('Documentation URL copied to OpenAPI discovery. It must point directly to an OpenAPI 3 JSON document.','نشانی مستندات به بخش شناسایی OpenAPI منتقل شد؛ باید مستقیماً به سند JSON نسخه ۳ اشاره کند.'));}} className="text-violet-300">{label('Try OpenAPI import','بررسی برای واردسازی OpenAPI')}</button>}{item.homepage_url&&item.homepage_url!==item.docs_url&&<a className="inline-flex items-center gap-1 text-slate-300 hover:underline" href={item.homepage_url} target="_blank" rel="noreferrer noopener">{label('Website','وب‌سایت')}<Globe className="h-3 w-3"/></a>}<button onClick={()=>void showDetails(item)} className="text-violet-300">{label('Details / alternatives','جزئیات / جایگزین‌ها')}</button><button onClick={()=>{setConnectorSelection(item);setNotice(label('API details copied into the connector form. Add the documented endpoint and your own key.','مشخصات API به فرم اتصال منتقل شد؛ endpoint مستند و کلید خود را وارد کنید.'));}} className="text-cyan-300">{label('Configure key','تنظیم کلید')}</button><button onClick={()=>void toggleFavorite(item)} className="text-amber-300">{favoriteKeys.includes(item.source_key)?'★ '+label('Saved','ذخیره‌شده'):'☆ '+label('Save','ذخیره')}</button></div>
    <p className="mt-3 text-[10px] text-amber-300">{label('Catalog listing only · connect and verify before execution','فقط ورودی کاتالوگ · پیش از اجرا باید اتصال و مستندات تأیید شوند')}</p>
   </article>)}
  </div>
  {data&&data.items.length===0&&!loading&&<div className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">{label('No APIs match these filters.','هیچ API مطابق این فیلترها یافت نشد.')}</div>}
  <div className="flex items-center justify-center gap-3"><button disabled={page<=1||loading} onClick={()=>setPage(v=>Math.max(1,v-1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>{label('Previous','قبلی')}</button><span className="text-xs text-slate-400">{page} / {pageCount}</span><button disabled={page>=pageCount||loading} onClick={()=>setPage(v=>Math.min(pageCount,v+1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">{label('Next','بعدی')}<ChevronRight className="h-4 w-4"/></button></div>
  <p className="text-[10px] leading-5 text-slate-500">{label('Importing this directory does not grant credentials or permission to call every service. API contracts, authentication, rate limits and terms must be reviewed before a connector is enabled.','واردکردن این فهرست به معنی دسترسی به کلید یا مجوز اجرای سرویس‌ها نیست. قرارداد API، احراز هویت، سهمیه و شرایط استفاده باید پیش از فعال‌سازی اتصال بررسی شوند.')}</p>
  <AfgApiConnectorPanel language={language} catalogSelection={connectorSelection} openApiSelection={openApiSelection}/>
 </div>;
};
