import React,{useCallback,useEffect,useState} from 'react';
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { Language } from '../../types/afg';

type LlmCatalogItem={
 source:string;source_key:string;provider_slug:string;provider_name:string;provider_type:string;
 base_url:string|null;api_key_url:string|null;description:string;free_tier_type:string;payment_requirement:string;
 free_tier_details:string;model_id:string|null;model_name:string|null;model_page_url:string|null;
 context_window:number|null;max_output_tokens:number|null;modalities:string[];rate_limit:string|null;
 source_updated_at:string|null;eligibility_status:string;review_note:string|null;sources?:string[];
};
type ResponseData={items:LlmCatalogItem[];page:number;pageSize:number;total:number};
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
export const AfgLlmApiCatalogPanel:React.FC<{language:Language}>=({language})=>{
 const locale=language==='dari'||language==='pashto'||language==='arabic'?language:'english';
 const dari=locale==='dari',rtl=['dari','pashto','persian','arabic','urdu'].includes(language);
 const ps:Record<string,string>={'Permanent free tier':'د تل لپاره وړیا','Renewable credits':'بیا نوي کېدونکي کریډیټونه','Trial':'ازمایښتي','Promotional':'اعلانیز / لنډمهاله','Unverified terms':'نه تایید شوي شرایط','No card stated':'د کارت یادونه نشته','Card required':'بانکي کارت اړین دی','Phone verification':'د ټیلیفون تایید','Account required':'حساب اړین دی','Not confirmed':'تایید شوی نه دی','Free LLM API Discovery':'د وړیا LLM API موندنه','Imported from two community-maintained GitHub directories. These are discovery candidates, not active model providers.':'له دوو ټولنیزو GitHub فهرستونو وارد شوي. دا یوازې د موندنې نوماندان دي، فعال ماډل برابرونکي نه دي.','Refresh list':'فهرست تازه کول','Search providers and model IDs…':'برابرونکي او د ماډل پېژندونه ولټوئ…','All free-tier types':'د وړیا پلان ټول ډولونه','Permanent free':'تل وړیا','Renewable credits':'بیا نوي کېدونکي کریډیټونه','Unknown terms':'نامعلوم شرایط','catalogue records':'د کتلاګ ریکارډونه','Candidate · not verified':'نوماند · نه دی تایید شوی','Loading catalogue…':'کتلاګ بارېږي…','Provider entry':'د برابرونکي ریکارډ','Candidate':'نوماند','context':'د متن ظرفیت','Reported limit':'اعلان شوی حد','Get API key':'د API کیلي ترلاسه کول','Model page':'د ماډل پاڼه','No provider key is stored and no model is activated by catalogue import. Verify official terms and a real inference probe first.':'د کتلاګ په واردولو سره نه کیلي ساتل کېږي او نه ماډل فعالېږي. لومړی رسمي شرایط او د API اصلي ازموینه تایید کړئ.','No LLM entries match this search.':'د دې لټون لپاره LLM ریکارډ ونه موندل شو.','Previous':'مخکینی','Next':'بل'},
 'Arabic': 'العربية'};
 const ar:Record<string,string>={'Permanent free tier':'مجاني دائماً','Renewable credits':'أرصدة متجددة','Trial':'تجريبي','Promotional':'ترويجي / مؤقت','Unverified terms':'شروط غير موثقة','No card stated':'لم يُذكر وجود بطاقة','Card required':'البطاقة مطلوبة','Phone verification':'التحقق بالهاتف','Account required':'الحساب مطلوب','Not confirmed':'غير مؤكد','Free LLM API Discovery':'اكتشاف واجهات API المجانية لنماذج LLM','Imported from two community-maintained GitHub directories. These are discovery candidates, not active model providers.':'تم الاستيراد من دليلين على GitHub تديرهما المجتمعات. هذه خيارات للاكتشاف وليست مزودات نماذج نشطة.','Refresh list':'تحديث القائمة','Search providers and model IDs…':'ابحث عن المزوّدين ومعرّفات النماذج…','All free-tier types':'جميع أنواع الخطط المجانية','Permanent free':'مجاني دائماً','Renewable credits':'أرصدة متجددة','Unknown terms':'شروط غير معروفة','catalogue records':'سجلات الفهرس','Candidate · not verified':'مرشح · غير موثق','Loading catalogue…':'جارٍ تحميل الفهرس…','Provider entry':'إدخال المزوّد','Candidate':'مرشح','context':'سياق','Reported limit':'الحد المعلن','Get API key':'الحصول على مفتاح API','Model page':'صفحة النموذج','No provider key is stored and no model is activated by catalogue import. Verify official terms and a real inference probe first.':'لا يتم حفظ مفتاح مزوّد ولا تفعيل أي نموذج عند استيراد الفهرس. تحقق أولاً من الشروط الرسمية واختبر الاستدلال فعلياً.','No LLM entries match this search.':'لا توجد إدخالات LLM تطابق هذا البحث.','Previous':'السابق','Next':'التالي'};
 const label=(en:string,fa:string)=>locale==='dari'?fa:locale==='pashto'?(ps[en]||en):locale==='arabic'?(ar[en]||en):en;
 const [query,setQuery]=useState('');
 const [freeTier,setFreeTier]=useState('all');
 const [data,setData]=useState<ResponseData|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const [page,setPage]=useState(1);
 const pageSize=60;
 const pageCount=Math.max(1,Math.ceil((data?.total||0)/pageSize));
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const params=new URLSearchParams({q:query.trim(),freeTier,page:String(page),pageSize:String(pageSize)});
   const result=await request('/api/api-hub/llm-catalog?'+params.toString());
   setData(result as ResponseData);
  }catch(e){setError(e instanceof Error?e.message:'LLM API catalogue is unavailable.');}
  finally{setLoading(false);}
 },[query,freeTier,refreshKey,page]);
 useEffect(()=>{void load();},[load]);
 const tierLabel=(tier:string)=>({
  permanent:label('Permanent free tier','رایگان دائمی'),
  renewable:label('Renewable credits','اعتبار تمدیدشونده'),
  trial:label('Trial','آزمایشی'),
  promotional:label('Promotional','تبلیغاتی / موقت'),
  unknown:label('Unverified terms','شرایط نامشخص'),
 }[tier]||tier);
 const paymentLabel=(value:string)=>({
  no_card:label('No card stated','بدون کارت بانکی'),
  card:label('Card required','کارت بانکی لازم'),
  phone_verification:label('Phone verification','تأیید تلفن'),
  registration:label('Account required','ثبت‌نام لازم'),
  unknown:label('Not confirmed','تأیید نشده'),
 }[value]||value);
 return <section className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex items-start gap-3">
    <div className="rounded-xl border border-violet-400/30 bg-slate-950 p-2"><Activity className="h-5 w-5 text-violet-300"/></div>
    <div><h3 className="font-black text-white">{label('Free LLM API Discovery','کاتالوگ APIهای رایگان هوش مصنوعی')}</h3>
     <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{label('Imported from two community-maintained GitHub directories. These are discovery candidates, not active model providers.','واردشده از دو فهرست عمومی GitHub؛ این موارد فقط کاندید کشف هستند و هنوز ارائه‌دهنده فعال مدل نیستند.')}</p>
    </div>
   </div>
   <button onClick={()=>setRefreshKey(v=>v+1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')}/>{label('Refresh list','تازه‌سازی فهرست')}</button>
  </div>
  <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
   <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"><Search className="h-4 w-4 text-slate-500"/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder={label('Search providers and model IDs…','جستجوی ارائه‌دهنده و شناسه مدل…')} className="w-full bg-transparent text-xs text-white outline-none"/></label>
   <select value={freeTier} onChange={e=>{setFreeTier(e.target.value);setPage(1);}} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
    <option value="all">{label('All free-tier types','همه انواع رایگان')}</option>
    <option value="permanent">{label('Permanent free','رایگان دائمی')}</option>
    <option value="renewable">{label('Renewable credits','اعتبار تمدیدشونده')}</option>
    <option value="trial">{label('Trial','آزمایشی')}</option>
    <option value="promotional">{label('Promotional','تبلیغاتی / موقت')}</option>
    <option value="unknown">{label('Unknown terms','شرایط نامشخص')}</option>
   </select>
  </div>
  <div className="flex flex-wrap gap-2 text-[10px]">
   <span className={pill+' border-violet-500/30 bg-violet-500/5 text-violet-200'}>{(data?.total||0).toLocaleString()} {label('catalogue records','رکورد کاتالوگ')}</span>
   <span className={pill+' border-amber-500/30 bg-amber-500/5 text-amber-200'}><ShieldCheck className="mr-1 h-3 w-3"/>{label('Candidate · not verified','کاندید · تأییدنشده')}</span>
  </div>
  {error&&<div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300">{error}</div>}
  {loading&&!data&&<div className="py-6 text-center text-xs text-slate-500">{label('Loading catalogue…','در حال بارگذاری…')}</div>}
  <div className="grid gap-2 md:grid-cols-2">
   {(data?.items||[]).map((item,index)=><article key={item.source_key||item.provider_slug+String(item.model_id)+index} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
    <div className="flex items-start justify-between gap-2">
     <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300">{item.provider_name}</p>
      <h4 className="mt-1 break-all text-sm font-semibold text-white">{item.model_name||item.model_id||label('Provider entry','رکورد ارائه‌دهنده')}</h4>
      {item.model_id&&<p className="mt-1 break-all font-mono text-[10px] text-slate-500">{item.model_id}</p>}
     </div>
     <span className={pill+' shrink-0 border-amber-500/20 text-amber-200'}>{label('Candidate','کاندید')}</span>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
     <span className={pill+' border-slate-700 text-slate-300'}>{tierLabel(item.free_tier_type)}</span>
     <span className={pill+' border-slate-700 text-slate-300'}>{paymentLabel(item.payment_requirement)}</span>
     {item.context_window!==null&&item.context_window>0&&<span className={pill+' border-slate-700 text-slate-300'}>{item.context_window.toLocaleString()} {label('context','کانتکست')}</span>}
    </div>
    {item.rate_limit&&<p className="mt-2 text-[10px] text-slate-400">{label('Reported limit','محدودیت اعلام‌شده')}: {item.rate_limit}</p>}
    {item.modalities?.length>0&&<p className="mt-1 text-[10px] text-slate-500">{item.modalities.join(' · ')}</p>}
    {item.free_tier_details&&<p className="mt-2 line-clamp-3 text-[10px] leading-4 text-slate-500">{item.free_tier_details}</p>}
    <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
     {item.api_key_url&&<a href={item.api_key_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">{label('Get API key','دریافت کلید API')}<ArrowUpRight className="h-3 w-3"/></a>}
     {item.model_page_url&&<a href={item.model_page_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-violet-300 hover:underline">{label('Model page','صفحه مدل')}<ArrowUpRight className="h-3 w-3"/></a>}
     {item.base_url&&<span className="break-all text-slate-500">{item.base_url}</span>}
    </div>
    <p className="mt-2 text-[9px] text-amber-300/80">{label('No provider key is stored and no model is activated by catalogue import. Verify official terms and a real inference probe first.','با واردسازی فهرست، کلید ذخیره یا مدلی فعال نمی‌شود. ابتدا شرایط رسمی و پاسخ واقعی API باید بررسی شود.')}</p>
   </article>)}
  </div>
  {data&&data.items.length===0&&!loading&&<div className="rounded-xl border border-slate-800 p-6 text-center text-xs text-slate-500">{label('No LLM entries match this search.','موردی مطابق جستجو پیدا نشد.')}</div>}
  {data&&data.total>pageSize&&<div className="flex items-center justify-center gap-3">
   <button disabled={page<=1||loading} onClick={()=>setPage(value=>Math.max(1,value-1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>{label('Previous','قبلی')}</button>
   <span className="text-xs text-slate-400">{page} / {pageCount}</span>
   <button disabled={page>=pageCount||loading} onClick={()=>setPage(value=>Math.min(pageCount,value+1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">{label('Next','بعدی')}<ChevronRight className="h-4 w-4"/></button>
  </div>}
  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
   <a href="https://github.com/mnfst/awesome-free-llm-apis" target="_blank" rel="noreferrer noopener" className="hover:text-cyan-300">mnfst/awesome-free-llm-apis ↗</a>
   <a href="https://github.com/open-free-llm-api/awesome-freellm-apis" target="_blank" rel="noreferrer noopener" className="hover:text-cyan-300">open-free-llm-api/awesome-freellm-apis ↗</a>
  </div>
 </section>;
};
