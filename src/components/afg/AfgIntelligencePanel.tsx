import React, { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, Download, RefreshCw, Sparkles, Trash2, GraduationCap, Code2, Search, GitBranch } from 'lucide-react';
import { AfgKnowledgeEnginePanel } from './AfgKnowledgeEnginePanel';

const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const csrf = () => {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='));
  if (cookie) { try { return decodeURIComponent(cookie.slice(9)); } catch { return cookie.slice(9); } }
  return sessionStorage.getItem('afg_csrf_token') || '';
};
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrf());
  const response = await fetch(API + path, { ...init, headers, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

type TrainingRow = { id: string; prompt: string; idealAnswer: string; createdAt: string };
type WorldStatus = { sources?: number; documents?: number; repositories?: number; releases?: number; codeFiles?: number; extractedSymbols?: number; indexedLanguages?: number; fullTextSearch?: boolean; vectorSearch?: boolean; modelWeightTraining?: boolean };
type CodeFileRow = { id: string; repository: string; path: string; language: string; url: string; license: string; symbols: Array<{name:string;kind:string;line?:number;approximate?:boolean}>; dependencies: Record<string,unknown>; excerpt: string };

export const AfgIntelligencePanel: React.FC<{ language: string }> = ({ language }) => {
  const locale = language === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english';
  const dari = locale === 'dari';
  const rtl = ['dari','pashto','persian','arabic','urdu'].includes(language);
  const intelPs:Record<string,string>={
    'Could not load intelligence data.':'د ځیرکتیا معلومات بار نه شول.','Programming knowledge engine is not available yet.':'د پروګرام‌لیکنې د پوهې انجن لا چمتو نه دی.','Training example saved with your consent.':'ستاسو په اجازه روزنیزه بېلګه خوندي شوه.','Delete this item?':'دا توکی ړنګ شي؟','Training dataset exported.':'د روزنې معلومات صادر شول.',
    'Memory, private knowledge and training-data curation':'حافظه، شخصي پوهه او د روزنیزو معلوماتو چمتو کول','Your documents and examples are private to your account. Saving examples does not automatically train model weights.':'ستاسو اسناد او بېلګې یوازې ستاسو حساب پورې اړه لري. د بېلګو خوندي کول د ماډل وزنونه په خپله نه روزي.',
    'Programming knowledge engine':'د پروګرام‌لیکنې د پوهې انجن','Search public repositories, source files, extracted code symbols and declared dependencies with source provenance.':'عامه زېرمتونونه، سرچینې فایلونه، د کوډ نښې او اعلان شوې تړاوونه د سرچینې له لینک سره ولټوئ.',
    'Repositories':'زېرمتونونه','Source files':'سرچینې فایلونه','Code symbols':'د کوډ نښې','Documents':'اسناد','Releases':'خپرونې','Languages':'ژبې','Search function, class, symbol or file...':'فنکشن، کلاس، نښه یا فایل ولټوئ...',
    'Dependency manifest':'د تړاوونو لېست','View source on GitHub':'سرچینه په GitHub کې وګورئ','No source files have been indexed yet.':'تر اوسه سرچینې فایلونه نه دي ثبت شوي.',
    'Symbol extraction is approximate. Public source is stored as reference material and is never executed.':'د نښو ایستل اټکلي دي. عامه سرچینې یوازې د مرجع په توګه ساتل کېږي او نه اجرا کېږي.',
    'Training examples':'روزنیزې بېلګې','Curate prompt and ideal-answer pairs for a future compatible fine-tuning job.':'د راتلونکي مناسب fine-tuning لپاره د پوښتنې او غوره ځواب جوړې چمتو کړئ.',
    'Example user prompt':'د کارن د پوښتنې بېلګه','Ideal assistant answer':'د مرستیال غوره ځواب','I consent to including this example in a curated training dataset. This does not automatically train a model.':'زه اجازه ورکوم چې دا بېلګه د روزنې په مجموعه کې شامله شي. دا کار ماډل په خپله نه روزي.',
    'Save example':'بېلګه خوندي کول','Export JSONL':'JSONL صادرول','No training examples curated yet.':'تر اوسه روزنیزې بېلګې نه دي چمتو شوې.','Refresh':'تازه کول'
  };
  const intelAr:Record<string,string>={
    'Could not load intelligence data.':'تعذر تحميل بيانات الذكاء.','Programming knowledge engine is not available yet.':'محرك المعرفة البرمجية غير متاح بعد.','Training example saved with your consent.':'تم حفظ المثال التدريبي بموافقتك.','Delete this item?':'هل تريد حذف هذا العنصر؟','Training dataset exported.':'تم تصدير مجموعة بيانات التدريب.',
    'Memory, private knowledge and training-data curation':'الذاكرة والمعرفة الخاصة وإعداد بيانات التدريب','Your documents and examples are private to your account. Saving examples does not automatically train model weights.':'مستنداتك وأمثلتك خاصة بحسابك. لا يؤدي حفظ الأمثلة تلقائياً إلى تدريب أوزان النموذج.',
    'Programming knowledge engine':'محرك المعرفة البرمجية','Search public repositories, source files, extracted code symbols and declared dependencies with source provenance.':'ابحث في المستودعات العامة وملفات المصدر ورموز الكود والتبعيات المعلنة مع الاحتفاظ بمصدرها.',
    'Repositories':'المستودعات','Source files':'ملفات المصدر','Code symbols':'رموز الكود','Documents':'المستندات','Releases':'الإصدارات','Languages':'اللغات','Search function, class, symbol or file...':'ابحث عن دالة أو فئة أو رمز أو ملف...',
    'Dependency manifest':'ملف التبعيات','View source on GitHub':'عرض المصدر على GitHub','No source files have been indexed yet.':'لم تتم فهرسة ملفات مصدر بعد.',
    'Symbol extraction is approximate. Public source is stored as reference material and is never executed.':'استخراج الرموز تقريبي. يُحفظ المصدر العام كمرجع ولا يتم تشغيله مطلقاً.',
    'Training examples':'أمثلة التدريب','Curate prompt and ideal-answer pairs for a future compatible fine-tuning job.':'جهّز أزواج المطالبات والإجابات المثالية لمهمة ضبط دقيق مستقبلية متوافقة.',
    'Example user prompt':'مثال على طلب المستخدم','Ideal assistant answer':'إجابة المساعد المثالية','I consent to including this example in a curated training dataset. This does not automatically train a model.':'أوافق على تضمين هذا المثال في مجموعة بيانات تدريب منسقة. لا يؤدي ذلك إلى تدريب النموذج تلقائياً.',
    'Save example':'حفظ المثال','Export JSONL':'تصدير JSONL','No training examples curated yet.':'لم يتم إعداد أمثلة تدريب بعد.','Refresh':'تحديث'
  };
  const intelText=(d:string,e:string)=>locale==='dari'?d:locale==='pashto'?(intelPs[e]||e):locale==='arabic'?(intelAr[e]||e):e;
  const [examples, setExamples] = useState<TrainingRow[]>([]);
  const [prompt, setPrompt] = useState('');
  const [idealAnswer, setIdealAnswer] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [worldStatus, setWorldStatus] = useState<WorldStatus|null>(null);
  const [worldError, setWorldError] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [codeFiles, setCodeFiles] = useState<CodeFileRow[]>([]);
  const [codeBusy, setCodeBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const training = await request('/api/intelligence/training/examples');
      setExamples(Array.isArray(training.examples) ? training.examples : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : (intelText('بارگذاری اطلاعات ناموفق بود.','Could not load intelligence data.')));
    } finally { setBusy(false); }
  }, [dari]);

  const loadWorld = useCallback(async () => {
    setWorldError('');
    try {
      const status = await request('/api/intelligence/world/status');
      setWorldStatus(status);
      const indexed = await request('/api/intelligence/world/code?limit=12');
      setCodeFiles(Array.isArray(indexed.codeFiles) ? indexed.codeFiles : []);
    } catch (e) {
      setWorldStatus(null);
      setWorldError(e instanceof Error ? e.message : (intelText('موتور دانش برنامه‌نویسی هنوز آماده نیست.','Programming knowledge engine is not available yet.')));
    }
  }, [dari]);

  useEffect(() => { void load(); void loadWorld(); }, [load, loadWorld]);

  const searchCode = async () => {
    setCodeBusy(true); setWorldError('');
    try {
      const params = new URLSearchParams({ q: codeQuery.trim(), limit: '30' });
      const result = await request('/api/intelligence/world/code?' + params.toString());
      setCodeFiles(Array.isArray(result.codeFiles) ? result.codeFiles : []);
    } catch (e) {
      setWorldError(e instanceof Error ? e.message : 'Could not search indexed source code.');
    } finally { setCodeBusy(false); }
  };

  const saveExample = async () => {
    if (!prompt.trim() || !idealAnswer.trim() || !consent) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/intelligence/training/examples', { method: 'POST', body: JSON.stringify({ prompt, idealAnswer, consent: true }) });
      setPrompt(''); setIdealAnswer(''); setConsent(false);
      setNotice(intelText('نمونه آموزشی با رضایت شما ذخیره شد.','Training example saved with your consent.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save training example.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm(intelText('این مورد حذف شود؟','Delete this item?'))) return;
    setBusy(true); setError('');
    try {
      await request('/api/intelligence/training/examples/' + id, { method: 'DELETE' });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete item.'); }
    finally { setBusy(false); }
  };

  const exportDataset = async () => {
    setBusy(true); setError('');
    try {
      const data = await request('/api/intelligence/training/export');
      const blob = new Blob([(Array.isArray(data.lines) ? data.lines : []).join('\n') + '\n'], { type: 'application/x-ndjson;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'afg-ai-training-examples.jsonl'; anchor.click();
      URL.revokeObjectURL(url);
      setNotice(intelText('فایل داده آموزشی آماده شد.','Training dataset exported.'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not export dataset.'); }
    finally { setBusy(false); }
  };

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white placeholder:text-slate-500';
  const cardClass = 'space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4';
  return <div className="space-y-5" dir={rtl ? 'rtl' : 'ltr'}>
    <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/50 to-violet-950/30 p-4">
      <div className="flex items-center gap-3"><BrainCircuit className="h-7 w-7 text-cyan-300"/><div><h3 className="font-black text-white">AFG AI Intelligence Core</h3><p className="text-xs text-slate-400">{intelText('حافظه، دانش خصوصی و آماده‌سازی داده‌های آموزشی','Memory, private knowledge and training-data curation')}</p></div></div>
      <p className="mt-3 text-xs leading-6 text-slate-300">{intelText('اسناد و نمونه‌های شما فقط به حساب خودتان تعلق دارند. افزودن نمونه آموزشی به‌معنای آموزش خودکار وزن‌های مدل نیست.','Your documents and examples are private to your account. Saving examples does not automatically train model weights.')}</p>
    </div>
    <AfgKnowledgeEnginePanel language={language}/>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}
    <section className={cardClass}>
      <div className="flex items-center gap-2"><Code2 className="h-5 w-5 text-cyan-300"/><h3 className="font-bold text-white">{intelText('دانش عمومی برنامه‌نویسی','Programming knowledge engine')}</h3></div>
      <p className="text-xs leading-5 text-slate-400">{intelText('مخزن‌های عمومی، فایل‌های منبع، نمادهای کد و وابستگی‌های پروژه را با حفظ پیوند منبع جست‌وجو کنید.','Search public repositories, source files, extracted code symbols and declared dependencies with source provenance.')}</p>
      {worldError && <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">{worldError}</p>}
      {worldStatus && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          [intelText('مخزن‌ها','Repositories'),worldStatus.repositories],
          [intelText('فایل‌های کد','Source files'),worldStatus.codeFiles],
          [intelText('نمادهای کد','Code symbols'),worldStatus.extractedSymbols],
          [intelText('اسناد','Documents'),worldStatus.documents],
          [intelText('نسخه‌ها','Releases'),worldStatus.releases],
          [intelText('زبان‌ها','Languages'),worldStatus.indexedLanguages],
        ].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-cyan-200">{Number(value||0).toLocaleString()}</p></div>)}
      </div>}
      <div className="flex gap-2">
        <input className={inputClass} value={codeQuery} onChange={e=>setCodeQuery(e.target.value)} maxLength={120} placeholder={intelText('نام تابع، کلاس یا فایل را جست‌وجو کنید','Search function, class, symbol or file...')}/>
        <button disabled={codeBusy||!worldStatus} onClick={()=>void searchCode()} className="shrink-0 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40"><Search className="inline h-4 w-4"/></button>
      </div>
      <div className="space-y-2">
        {codeFiles.map(file=><article key={file.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-start gap-2"><GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-violet-300"/><div className="min-w-0 flex-1"><p className="break-all text-xs font-bold text-white">{file.repository}</p><p className="break-all text-[11px] text-cyan-200">{file.path}</p><p className="mt-1 text-[10px] text-slate-500">{file.language} · {file.license||'unknown license'}</p></div></div>
          {Array.isArray(file.symbols)&&file.symbols.length>0&&<p className="mt-2 break-words text-[10px] leading-5 text-slate-400">{file.symbols.slice(0,12).map(symbol=>symbol.kind+': '+symbol.name+(symbol.line?' (L'+symbol.line+')':'')).join(' · ')}{file.symbols.some(symbol=>symbol.approximate)?' · approximate':''}</p>}
          {file.dependencies&&Object.keys(file.dependencies).length>0&&<p className="mt-1 text-[10px] text-violet-200">{intelText('فایل وابستگی','Dependency manifest')}: {String(file.dependencies.manifest||'manifest')}</p>}
          <a href={file.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-semibold text-cyan-300 underline">{intelText('مشاهده منبع در GitHub','View source on GitHub')}</a>
        </article>)}
        {worldStatus&&!codeFiles.length&&<p className="text-xs text-slate-500">{intelText('هنوز فایل کدی در موتور دانش ثبت نشده است.','No source files have been indexed yet.')}</p>}
      </div>
      <p className="text-[10px] leading-5 text-slate-500">{intelText('استخراج نمادها تقریبی است؛ فایل‌های عمومی فقط به‌عنوان مرجع ذخیره می‌شوند و اجرا نمی‌شوند.','Symbol extraction is approximate. Public source is stored as reference material and is never executed.')}</p>
    </section>
    <section className={cardClass}>
      <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-violet-300"/><h3 className="font-bold text-white">{intelText('نمونه‌های آموزشی','Training examples')}</h3></div>
      <p className="text-xs text-slate-400">{intelText('پرسش و پاسخ نمونه را برای آماده‌سازی مجموعه داده مدل ثبت کنید.','Curate prompt and ideal-answer pairs for a future compatible fine-tuning job.')}</p>
      <textarea className={inputClass} value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={10000} rows={3} placeholder={intelText('پرسش نمونه','Example user prompt')}/>
      <textarea className={inputClass} value={idealAnswer} onChange={e=>setIdealAnswer(e.target.value)} maxLength={20000} rows={4} placeholder={intelText('پاسخ مطلوب','Ideal assistant answer')}/>
      <label className="flex items-start gap-2 text-xs leading-5 text-slate-400"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 accent-cyan-400"/><span>{intelText('رضایت می‌دهم این نمونه برای آماده‌سازی مجموعه داده آموزشی استفاده شود. این کار آموزش خودکار مدل نیست.','I consent to including this example in a curated training dataset. This does not automatically train a model.')}</span></label>
      <div className="flex flex-wrap gap-2"><button disabled={busy||!prompt.trim()||!idealAnswer.trim()||!consent} onClick={()=>void saveExample()} className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white disabled:opacity-40"><Sparkles className="mr-1 inline h-4 w-4"/>{intelText('ذخیره نمونه','Save example')}</button><button disabled={busy||!examples.length} onClick={()=>void exportDataset()} className="rounded-xl border border-cyan-700 px-4 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40"><Download className="mr-1 inline h-4 w-4"/>{intelText('خروجی JSONL','Export JSONL')}</button></div>
      <div className="space-y-2">{examples.map(item=><article key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-semibold text-white">{item.prompt}</p><p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{item.idealAnswer}</p></div><button aria-label="Delete training example" onClick={()=>void remove(item.id)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4"/></button></article>)}
      {!examples.length && <p className="text-xs text-slate-500">{intelText('هنوز نمونه آموزشی ثبت نشده است.','No training examples curated yet.')}</p>}</div>
    </section>
    <button onClick={()=>void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><RefreshCw className="h-4 w-4"/>{intelText('تازه‌سازی','Refresh')}</button>
  </div>;
};
