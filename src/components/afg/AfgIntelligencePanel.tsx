import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, BrainCircuit, Download, Plus, RefreshCw, Sparkles, Trash2, GraduationCap } from 'lucide-react';

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

type DocumentRow = { id: string; title: string; sourceLabel: string; characterCount: number; updatedAt: string };
type TrainingRow = { id: string; prompt: string; idealAnswer: string; createdAt: string };

export const AfgIntelligencePanel: React.FC<{ language: string }> = ({ language }) => {
  const dari = language === 'dari';
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [examples, setExamples] = useState<TrainingRow[]>([]);
  const [title, setTitle] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [content, setContent] = useState('');
  const [prompt, setPrompt] = useState('');
  const [idealAnswer, setIdealAnswer] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [knowledge, training] = await Promise.all([
        request('/api/intelligence/knowledge'),
        request('/api/intelligence/training/examples'),
      ]);
      setDocuments(Array.isArray(knowledge.documents) ? knowledge.documents : []);
      setExamples(Array.isArray(training.examples) ? training.examples : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'بارگذاری اطلاعات ناموفق بود.' : 'Could not load intelligence data.'));
    } finally { setBusy(false); }
  }, [dari]);

  useEffect(() => { void load(); }, [load]);

  const saveKnowledge = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/intelligence/knowledge', { method: 'POST', body: JSON.stringify({ title, content, sourceLabel }) });
      setTitle(''); setContent(''); setSourceLabel('');
      setNotice(dari ? 'دانش خصوصی ذخیره شد.' : 'Private knowledge saved.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save knowledge.'); }
    finally { setBusy(false); }
  };

  const saveExample = async () => {
    if (!prompt.trim() || !idealAnswer.trim() || !consent) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/intelligence/training/examples', { method: 'POST', body: JSON.stringify({ prompt, idealAnswer, consent: true }) });
      setPrompt(''); setIdealAnswer(''); setConsent(false);
      setNotice(dari ? 'نمونه آموزشی با رضایت شما ذخیره شد.' : 'Training example saved with your consent.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save training example.'); }
    finally { setBusy(false); }
  };

  const remove = async (kind: 'knowledge'|'training', id: string) => {
    if (!window.confirm(dari ? 'این مورد حذف شود؟' : 'Delete this item?')) return;
    setBusy(true); setError('');
    try {
      await request(kind === 'knowledge' ? '/api/intelligence/knowledge/' + id : '/api/intelligence/training/examples/' + id, { method: 'DELETE' });
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
      setNotice(dari ? 'فایل داده آموزشی آماده شد.' : 'Training dataset exported.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not export dataset.'); }
    finally { setBusy(false); }
  };

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white placeholder:text-slate-500';
  const cardClass = 'space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4';
  return <div className="space-y-5" dir={dari ? 'rtl' : 'ltr'}>
    <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/50 to-violet-950/30 p-4">
      <div className="flex items-center gap-3"><BrainCircuit className="h-7 w-7 text-cyan-300"/><div><h3 className="font-black text-white">AFG AI Intelligence Core</h3><p className="text-xs text-slate-400">{dari?'حافظه، دانش خصوصی و آماده‌سازی داده‌های آموزشی':'Memory, private knowledge and training-data curation'}</p></div></div>
      <p className="mt-3 text-xs leading-6 text-slate-300">{dari?'اسناد و نمونه‌های شما فقط به حساب خودتان تعلق دارند. افزودن نمونه آموزشی به‌معنای آموزش خودکار وزن‌های مدل نیست.':'Your documents and examples are private to your account. Saving examples does not automatically train model weights.'}</p>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}
    <section className={cardClass}>
      <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-cyan-300"/><h3 className="font-bold text-white">{dari?'دانش اختصاصی من':'My private knowledge'}</h3></div>
      <p className="text-xs text-slate-400">{dari?'متن‌های معتبر خود را اضافه کنید تا هنگام پرسش‌های مرتبط در چت بازیابی شوند.':'Add reference text that can be retrieved during relevant chats.'}</p>
      <input className={inputClass} value={title} onChange={e=>setTitle(e.target.value)} maxLength={180} placeholder={dari?'عنوان سند':'Document title'}/>
      <input className={inputClass} value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} maxLength={180} placeholder={dari?'منبع (اختیاری)':'Source label (optional)'}/>
      <textarea className={inputClass} value={content} onChange={e=>setContent(e.target.value)} maxLength={30000} rows={5} placeholder={dari?'متن دانش را اینجا وارد کنید...':'Paste knowledge text here...'} />
      <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-slate-500">{content.length.toLocaleString()} / 30,000</span><button disabled={busy||!title.trim()||!content.trim()} onClick={()=>void saveKnowledge()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40"><Plus className="mr-1 inline h-4 w-4"/>{dari?'افزودن دانش':'Add knowledge'}</button></div>
      <div className="space-y-2">{documents.map(doc=><article key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{doc.title}</p><p className="text-[10px] text-slate-500">{doc.sourceLabel||'—'} · {doc.characterCount.toLocaleString()} {dari?'نویسه':'chars'}</p></div><button aria-label="Delete knowledge" onClick={()=>void remove('knowledge',doc.id)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4"/></button></article>)}
      {!documents.length && <p className="text-xs text-slate-500">{dari?'هنوز سندی اضافه نشده است.':'No knowledge documents added yet.'}</p>}</div>
    </section>
    <section className={cardClass}>
      <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-violet-300"/><h3 className="font-bold text-white">{dari?'نمونه‌های آموزشی':'Training examples'}</h3></div>
      <p className="text-xs text-slate-400">{dari?'پرسش و پاسخ نمونه را برای آماده‌سازی مجموعه داده مدل ثبت کنید.':'Curate prompt and ideal-answer pairs for a future compatible fine-tuning job.'}</p>
      <textarea className={inputClass} value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={10000} rows={3} placeholder={dari?'پرسش نمونه':'Example user prompt'}/>
      <textarea className={inputClass} value={idealAnswer} onChange={e=>setIdealAnswer(e.target.value)} maxLength={20000} rows={4} placeholder={dari?'پاسخ مطلوب':'Ideal assistant answer'}/>
      <label className="flex items-start gap-2 text-xs leading-5 text-slate-400"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 accent-cyan-400"/><span>{dari?'رضایت می‌دهم این نمونه برای آماده‌سازی مجموعه داده آموزشی استفاده شود. این کار آموزش خودکار مدل نیست.':'I consent to including this example in a curated training dataset. This does not automatically train a model.'}</span></label>
      <div className="flex flex-wrap gap-2"><button disabled={busy||!prompt.trim()||!idealAnswer.trim()||!consent} onClick={()=>void saveExample()} className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white disabled:opacity-40"><Sparkles className="mr-1 inline h-4 w-4"/>{dari?'ذخیره نمونه':'Save example'}</button><button disabled={busy||!examples.length} onClick={()=>void exportDataset()} className="rounded-xl border border-cyan-700 px-4 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40"><Download className="mr-1 inline h-4 w-4"/>{dari?'خروجی JSONL':'Export JSONL'}</button></div>
      <div className="space-y-2">{examples.map(item=><article key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-semibold text-white">{item.prompt}</p><p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{item.idealAnswer}</p></div><button aria-label="Delete training example" onClick={()=>void remove('training',item.id)} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4"/></button></article>)}
      {!examples.length && <p className="text-xs text-slate-500">{dari?'هنوز نمونه آموزشی ثبت نشده است.':'No training examples curated yet.'}</p>}</div>
    </section>
    <button onClick={()=>void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><RefreshCw className="h-4 w-4"/>{dari?'تازه‌سازی':'Refresh'}</button>
  </div>;
};
