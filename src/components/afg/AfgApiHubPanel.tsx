import React,{useCallback,useEffect,useMemo,useState} from 'react';
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, Database, Globe, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { Language } from '../../types/afg';
import { AfgApiConnectorPanel } from './AfgApiConnectorPanel.tsx';

type CatalogItem={source_key:string;name:string;description:string;auth:string;https:string;cors:string;category:string;homepage_url:string|null;docs_url:string|null;icon_url:string|null;image_url:string|null;site_name:string|null;site_description:string|null;health_status:string;response_time_ms:number|null;last_health_check:string|null};
type CatalogResponse={items:CatalogItem[];page:number;pageSize:number;total:number;categories:Array<{category:string;count:number}>};
type SyncState={configured?:boolean;sync?:{status:string;items_imported:number;pages_fetched:number;last_started_at:string|null;last_completed_at:string|null;last_error:string|null}|null;mcpDirectory?:{total:number}};
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
export const AfgApiHubPanel:React.FC<{language:Language;adminMode?:boolean}>=({language,adminMode=false})=>{
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
 const [loading,setLoading]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
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
 const update=(setter:(value:string)=>void)=>(value:string)=>{setter(value);setPage(1);};
 const label=(en:string,fa:string)=>dari?fa:en;
 return <div className="space-y-4">
  <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex items-start gap-3"><div className="rounded-xl border border-cyan-400/30 bg-slate-950 p-2"><Database className="h-5 w-5 text-cyan-300"/></div><div><h2 className="text-lg font-black text-white">{label('Universal API Hub','مرکز یکپارچه API')}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{label('Discover and filter the complete Public APIs directory. Entries are metadata until their official API contract and credentials are configured.','تمام فهرست Public APIs را جستجو و دسته‌بندی کنید. هر ورودی تا زمان تأیید مستندات و تنظیم اتصال، فقط اطلاعات کاتالوگ است.')}</p></div></div>
    {adminMode&&<button disabled={refreshing} onClick={()=>void syncNow()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><RefreshCw className={'h-4 w-4 '+(refreshing?'animate-spin':'')}/>{label('Sync catalog','همگام‌سازی فهرست')}</button>}
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
   <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Catalog entries','تعداد APIها')}</p><b className="text-xl text-white">{(data?.total||0).toLocaleString()}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Categories','دسته‌ها')}</p><b className="text-xl text-white">{(data?.categories?.length||0).toLocaleString()}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('MCP servers','سرورهای MCP')}</p><b className="text-xl text-white">{(sync?.mcpDirectory?.total||0).toLocaleString()}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">{label('Catalog sync','وضعیت همگام‌سازی')}</p><b className="text-sm text-white">{sync?.sync?.status||'—'}</b></div>
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">9Router Gateway</p><b className={'text-sm '+(gateway?.configured?'text-emerald-300':'text-amber-300')}>{gateway?.configured?label('Configured','تنظیم شده'):label('Not configured','تنظیم نشده')}</b></div>
   </div>
   {sync?.sync?.last_error&&<p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300">{sync.sync.last_error}</p>}
   {!gateway?.configured&&<p className="mt-3 text-[11px] text-slate-400">{label('Set NINEROUTER_BASE_URL on the server; NINEROUTER_API_KEY is optional when 9Router authentication is disabled. Apply migrations 0012–0013.','NINEROUTER_BASE_URL را فقط در سرور تنظیم کنید؛ NINEROUTER_API_KEY فقط در صورت فعال‌بودن احراز هویت 9Router لازم است. مهاجرت‌های 0012 تا 0013 را اجرا کنید.')}</p>}
  </section>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">{notice}</div>}
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
  {selectedDetails?.item&&<section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4"><div className="flex items-start justify-between"><div><p className="text-[10px] text-violet-300">{selectedDetails.item.category}</p><h3 className="font-bold text-white">{selectedDetails.item.name}</h3><p className="mt-1 text-xs text-slate-400">{selectedDetails.item.description}</p></div><button onClick={()=>setSelectedDetails(null)} className="text-slate-400">×</button></div><div className="mt-3"><b className="text-xs text-white">{label('Similar alternatives','گزینه‌های مشابه')}</b><div className="mt-2 flex flex-wrap gap-2">{(selectedDetails.alternatives||[]).map((alt:any)=><button key={alt.source_key} onClick={()=>void showDetails(alt)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-cyan-200">{alt.name}</button>)}</div></div></section>}
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-400">{label('Showing','نمایش') } {(data?.items?.length||0)} / {(data?.total||0).toLocaleString()} {label('entries','مورد')}</p><button onClick={()=>void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300"><RefreshCw className="h-3 w-3"/>{label('Refresh','تازه‌سازی')}</button></div>
  {loading&&!data&&<div className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">{label('Loading catalog…','در حال بارگذاری فهرست…')}</div>}
  <div className="grid gap-3 md:grid-cols-2">
   {(data?.items||[]).map(item=><article key={item.source_key} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2">{item.icon_url&&<img src={item.icon_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-lg bg-slate-950 object-contain p-1"/>}<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{item.category}</p><h3 className="mt-1 truncate font-bold text-white">{item.name}</h3><p className="text-[10px] text-slate-500">{item.site_name||''}</p></div></div><span className={pill+' border-slate-700 bg-slate-950 text-slate-300'}>{item.health_status||'unknown'}</span></div>
    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{item.description||label('No description supplied.','توضیحی ثبت نشده است.')}</p>
    <div className="mt-3 flex flex-wrap gap-1.5"><span className={pill+' border-slate-700 text-slate-300'}>Auth: {item.auth}</span><span className={pill+' border-slate-700 text-slate-300'}>HTTPS: {item.https}</span><span className={pill+' border-slate-700 text-slate-300'}>CORS: {item.cors}</span></div>
    <div className="mt-4 flex flex-wrap gap-3 text-xs">{item.docs_url&&<a className="inline-flex items-center gap-1 text-cyan-300 hover:underline" href={item.docs_url} target="_blank" rel="noreferrer noopener">{label('API Docs','مستندات API')}<ArrowUpRight className="h-3 w-3"/></a>}{item.homepage_url&&item.homepage_url!==item.docs_url&&<a className="inline-flex items-center gap-1 text-slate-300 hover:underline" href={item.homepage_url} target="_blank" rel="noreferrer noopener">{label('Website','وب‌سایت')}<Globe className="h-3 w-3"/></a>}<button onClick={()=>void showDetails(item)} className="text-violet-300">{label('Details / alternatives','جزئیات / جایگزین‌ها')}</button><button onClick={()=>void toggleFavorite(item)} className="text-amber-300">{favoriteKeys.includes(item.source_key)?'★ '+label('Saved','ذخیره‌شده'):'☆ '+label('Save','ذخیره')}</button></div>
    <p className="mt-3 text-[10px] text-amber-300">{label('Catalog listing only · connect and verify before execution','فقط ورودی کاتالوگ · پیش از اجرا باید اتصال و مستندات تأیید شوند')}</p>
   </article>)}
  </div>
  {data&&data.items.length===0&&!loading&&<div className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">{label('No APIs match these filters.','هیچ API مطابق این فیلترها یافت نشد.')}</div>}
  <div className="flex items-center justify-center gap-3"><button disabled={page<=1||loading} onClick={()=>setPage(v=>Math.max(1,v-1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>{label('Previous','قبلی')}</button><span className="text-xs text-slate-400">{page} / {pageCount}</span><button disabled={page>=pageCount||loading} onClick={()=>setPage(v=>Math.min(pageCount,v+1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">{label('Next','بعدی')}<ChevronRight className="h-4 w-4"/></button></div>
  <p className="text-[10px] leading-5 text-slate-500">{label('Importing this directory does not grant credentials or permission to call every service. API contracts, authentication, rate limits and terms must be reviewed before a connector is enabled.','واردکردن این فهرست به معنی دسترسی به کلید یا مجوز اجرای سرویس‌ها نیست. قرارداد API، احراز هویت، سهمیه و شرایط استفاده باید پیش از فعال‌سازی اتصال بررسی شوند.')}</p>
  <AfgApiConnectorPanel language={language}/>
 </div>;
};
