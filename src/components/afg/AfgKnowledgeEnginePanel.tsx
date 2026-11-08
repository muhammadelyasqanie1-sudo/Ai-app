import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BookOpen, Check, Database, FileText, Globe2, Link2, Loader2,
  Pencil, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';

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

type Status = {
  ready: boolean;
  documents?: number;
  chunks?: number;
  characters?: number;
  staleDocuments?: number;
  researchRunsLastHour?: number;
  categories?: Array<{ category: string; total: number }>;
  limits?: { documents?: number; characters?: number; researchRunsPerHour?: number };
  capabilities?: {
    fullTextSearch?: boolean; vectorSearch?: boolean; embeddingModel?: string | null;
    webSearch?: boolean; browserReading?: boolean; sourceRefresh?: boolean;
  };
};
type DocumentRow = {
  id: string; title: string; category: string; sourceLabel: string; sourceUrl: string | null;
  trustLevel: string; verification: string; summary: string; tags: string[];
  characterCount: number; updatedAt: string; lastVerifiedAt: string | null;
  refreshAfter: string | null; snippet?: string;
};
type DocumentDetail = {
  document: DocumentRow & { verification: string };
  content: string;
  chunks: Array<{ chunkIndex: number; heading: string; content: string }>;
  researchOrigin: { runId: string; query: string; depth: string; sourceUrl?: string } | null;
};
type Citation = {
  index: number; title: string; url: string; domain: string; trustLevel: string;
  verification: string; publishedAt: string | null; fetchMethod: string; documentId: string | null;
};
type ResearchResult = {
  runId: string; status: string; report: string; citations: Citation[];
  sources: Array<{ index: number; url: string; status: string; error?: string; verification: string }>;
  savedDocuments: number; deduplicatedDocuments: number; warnings: string[];
};

const CATEGORIES = [
  'programming', 'ai-ml', 'security', 'frontend', 'backend', 'databases', 'devops',
  'mobile', 'architecture', 'documentation', 'research', 'general', 'other',
];

function verificationTone(value: string) {
  if (value === 'official') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (value === 'multi_source') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  if (value === 'user_corrected') return 'border-violet-500/30 bg-violet-500/10 text-violet-200';
  if (value === 'single_source') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-slate-600 bg-slate-800 text-slate-300';
}

function cleanSnippet(value?: string) {
  return String(value || '').replace(/<<|>>/g, '').slice(0, 700);
}

export const AfgKnowledgeEnginePanel: React.FC<{ language: string }> = ({ language }) => {
  const dari = language === 'dari';
  const [status, setStatus] = useState<Status | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<DocumentDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editCategory, setEditCategory] = useState('general');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchDepth, setResearchDepth] = useState<'standard' | 'deep'>('standard');
  const [researchCategory, setResearchCategory] = useState('');
  const [saveResearch, setSaveResearch] = useState(true);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addSourceUrl, setAddSourceUrl] = useState('');

  const load = useCallback(async (searchQuery = query, searchCategory = category) => {
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (searchCategory) params.set('category', searchCategory);
      const [statusData, list] = await Promise.all([
        request('/api/knowledge/status').catch((e) => { throw e; }),
        request('/api/knowledge?' + params.toString()),
      ]);
      setStatus(statusData);
      setDocuments(Array.isArray(list.documents) ? list.documents : []);
      setTotal(Number(list.total || 0));
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : (dari ? 'بارگذاری موتور دانش ناموفق بود.' : 'Could not load the knowledge engine.'));
    } finally { setBusy(false); }
  }, [dari, query, category]);

  useEffect(() => { void load('', ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runResearch = async () => {
    if (researchQuery.trim().length < 3) return;
    setResearchBusy(true); setError(''); setNotice(''); setResearch(null);
    try {
      const result = await request('/api/knowledge/research', {
        method: 'POST',
        body: JSON.stringify({
          query: researchQuery.trim(),
          depth: researchDepth,
          categories: researchCategory ? [researchCategory] : [],
          save: saveResearch,
        }),
      });
      setResearch(result as ResearchResult);
      setNotice(dari
        ? `تحقیق کامل شد. ${Number(result.savedDocuments || 0)} سند جدید ذخیره شد.`
        : `Research completed. ${Number(result.savedDocuments || 0)} new source(s) saved.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'تحقیق انجام نشد.' : 'Deep research failed.'));
    } finally { setResearchBusy(false); }
  };

  const addNote = async () => {
    if (addTitle.trim().length < 1 || addContent.trim().length < 20) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title: addTitle.trim(),
          content: addContent,
          ...(addCategory ? { category: addCategory } : {}),
          ...(addSourceUrl.trim() ? { sourceUrl: addSourceUrl.trim() } : {}),
        }),
      });
      setAddTitle(''); setAddContent(''); setAddSourceUrl(''); setAddCategory('');
      setNotice(result.deduplicated
        ? (dari ? 'این متن از قبل در دانش شما وجود داشت.' : 'This exact text already exists in your knowledge base.')
        : (dari ? 'دانش جدید ذخیره و قطعه‌بندی شد.' : 'Knowledge saved and chunked for retrieval.'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'ذخیره دانش ناموفق بود.' : 'Could not save the knowledge.'));
    } finally { setBusy(false); }
  };

  const openDocument = async (id: string) => {
    setBusy(true); setError('');
    try {
      const detail = await request('/api/knowledge/' + id);
      const doc = detail.document as DocumentRow;
      setSelected(detail as DocumentDetail);
      setEditing(false);
      setEditTitle(doc.title);
      setEditContent(String(detail.content || ''));
      setEditSummary(doc.summary || '');
      setEditCategory(doc.category || 'general');
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'سند باز نشد.' : 'Could not open the document.'));
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/knowledge/' + selected.document.id, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          summary: editSummary,
          category: editCategory,
        }),
      });
      setNotice(dari ? 'اصلاح شما ذخیره شد.' : 'Your correction was saved.');
      setEditing(false);
      await openDocument(selected.document.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'اصلاح ذخیره نشد.' : 'Could not save the correction.'));
    } finally { setBusy(false); }
  };

  const removeDocument = async (id: string) => {
    if (!window.confirm(dari ? 'این سند دانش برای همیشه حذف شود؟' : 'Delete this knowledge document permanently?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/knowledge/' + id, { method: 'DELETE' });
      if (selected?.document.id === id) setSelected(null);
      setNotice(dari ? 'سند حذف شد.' : 'Knowledge document deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'حذف ناموفق بود.' : 'Could not delete the document.'));
    } finally { setBusy(false); }
  };

  const refreshOne = async (id: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/knowledge/' + id + '/refresh', { method: 'POST' });
      setNotice(result.preserved
        ? (dari ? 'منبع تغییر کرده بود، اما اصلاح شما حفظ شد.' : 'The source changed, but your correction was preserved.')
        : result.changed
          ? (dari ? 'منبع تغییر کرده بود و دانش به‌روزرسانی شد.' : 'The source changed and the knowledge was refreshed.')
          : (dari ? 'منبع هنوز به‌روز است.' : 'The source is still current.'));
      await load();
      if (selected?.document.id === id) await openDocument(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'تازه‌سازی ناموفق بود.' : 'Could not refresh the source.'));
    } finally { setBusy(false); }
  };

  const refreshStale = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const stale = await request('/api/knowledge/stale?limit=5');
      const rows = Array.isArray(stale.documents) ? stale.documents : [];
      if (!rows.length) { setNotice(dari ? 'هیچ دانش قدیمی وجود ندارد.' : 'No stale knowledge found.'); return; }
      let refreshed = 0;
      for (const row of rows) {
        try { await request('/api/knowledge/' + row.id + '/refresh', { method: 'POST' }); refreshed += 1; }
        catch { /* Keep refreshing the remaining independent sources. */ }
      }
      setNotice(dari ? `${refreshed} منبع بررسی شد.` : `${refreshed} source(s) checked.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (dari ? 'به‌روزرسانی منابع قدیمی ناموفق بود.' : 'Could not refresh stale knowledge.'));
    } finally { setBusy(false); }
  };

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white placeholder:text-slate-500';
  const cardClass = 'space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4';
  const badge = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold';

  return <div className="space-y-5" dir={dari ? 'rtl' : 'ltr'}>
    <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/50 to-violet-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-cyan-300" />
          <div>
            <h3 className="font-black text-white">{dari ? 'موتور دانش خودآموز' : 'Self-learning knowledge engine'}</h3>
            <p className="text-xs text-slate-400">{dari ? 'تحقیق چندمنبعی، ذخیره با استناد، جست‌وجو، اصلاح و به‌روزرسانی' : 'Multi-source research, cited storage, retrieval, correction and freshness'}</p>
          </div>
        </div>
        <button onClick={() => void load(query, category)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{dari ? 'تازه‌سازی' : 'Refresh'}
        </button>
      </div>
      {status && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [dari ? 'اسناد' : 'Documents', status.documents],
          [dari ? 'قطعه‌های قابل بازیابی' : 'Retrieval chunks', status.chunks],
          [dari ? 'نیازمند به‌روزرسانی' : 'Stale sources', status.staleDocuments],
          [dari ? 'تحقیق در یک ساعت' : 'Research runs / hour', status.researchRunsLastHour],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-[10px] text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-cyan-200">{Number(value || 0).toLocaleString()}</p>
        </div>)}
      </div>}
      {status?.capabilities && <div className="mt-3 flex flex-wrap gap-2">
        <span className={`${badge} border-cyan-500/30 bg-cyan-500/10 text-cyan-200`}><Search className="h-3 w-3" />{dari ? 'جست‌وجوی متنی کامل' : 'Full-text search'}</span>
        <span className={`${badge} ${status.capabilities.vectorSearch ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}><Sparkles className="h-3 w-3" />{status.capabilities.vectorSearch ? (dari ? 'رتبه‌بندی امبدینگ' : 'Embedding rerank') : (dari ? 'امبدینگ پیکربندی نشده' : 'Embeddings not configured')}</span>
        <span className={`${badge} ${status.capabilities.webSearch ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}><Globe2 className="h-3 w-3" />{status.capabilities.webSearch ? (dari ? 'جست‌وجوی وب آماده' : 'Web search ready') : (dari ? 'جست‌وجوی وب پیکربندی نشده' : 'Web search not configured')}</span>
        <span className={`${badge} ${status.capabilities.browserReading ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}><Globe2 className="h-3 w-3" />{status.capabilities.browserReading ? (dari ? 'خواندن با مرورگر' : 'Browser reading ready') : (dari ? 'مرورگر پیکربندی نشده' : 'Browser reading not configured')}</span>
      </div>}
    </div>

    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}

    <section className={cardClass}>
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-300" /><h3 className="font-bold text-white">{dari ? 'تحقیق عمیق' : 'Deep research'}</h3></div>
      <p className="text-xs leading-5 text-slate-400">{dari ? 'Tavily جست‌وجو می‌کند و در حالت عمیق، Browserbase صفحات عمومی را در یک نشست جداگانه می‌خواند. متن ارائه‌شده توسط جست‌وجو یا صفحه بازشده به‌عنوان شاهد استفاده می‌شود و منابع خوانده‌نشده صریحاً گزارش می‌شوند؛ هیچ‌کدام تضمین کامل‌بودن صفحه نیست.' : 'Tavily searches; in deep mode Browserbase opens public pages in an isolated session. Provider-supplied text or the opened page becomes evidence, and unread sources are reported explicitly. Neither guarantees the complete page.'}</p>
      <textarea className={inputClass} rows={3} maxLength={500} value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} placeholder={dari ? 'چه چیزی را باید تحقیق کنم؟ مثلاً: بهترین روش‌های RAG در سال ۲۰۲۶' : 'What should AFG AI research? e.g. current best practices for RAG in 2026'} />
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={inputClass} value={researchDepth} onChange={(e) => setResearchDepth(e.target.value === 'deep' ? 'deep' : 'standard')}>
          <option value="standard">{dari ? 'استاندارد (سریع‌تر)' : 'Standard (faster)'}</option>
          <option value="deep">{dari ? 'عمیق (خواندن با مرورگر)' : 'Deep (browser reading)'}</option>
        </select>
        <select className={inputClass} value={researchCategory} onChange={(e) => setResearchCategory(e.target.value)}>
          <option value="">{dari ? 'دسته خودکار' : 'Auto category'}</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300">
          <input type="checkbox" checked={saveResearch} onChange={(e) => setSaveResearch(e.target.checked)} className="accent-cyan-400" />
          {dari ? 'ذخیره در دانش خصوصی من' : 'Save to my private knowledge'}
        </label>
      </div>
      <button disabled={researchBusy || researchQuery.trim().length < 3 || !status} onClick={() => void runResearch()} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
        {researchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {researchBusy ? (dari ? 'در حال تحقیق...' : 'Researching...') : (dari ? 'تحقیق و ذخیره' : 'Research and save')}
      </button>
      {research && <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className={`${badge} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`}><Check className="h-3 w-3" />{research.savedDocuments} {dari ? 'سند جدید' : 'new'}</span>
          <span className={`${badge} border-cyan-500/30 bg-cyan-500/10 text-cyan-200`}><Link2 className="h-3 w-3" />{research.deduplicatedDocuments} {dari ? 'تکراری پیوند شد' : 'deduplicated'}</span>
          <span className={`${badge} border-slate-600 bg-slate-800 text-slate-300`}><FileText className="h-3 w-3" />{research.citations.length} {dari ? 'استناد' : 'citations'}</span>
        </div>
        {research.warnings.length > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          <p className="mb-1 flex items-center gap-1 font-bold"><AlertTriangle className="h-3 w-3" />{dari ? 'هشدارها' : 'Warnings'}</p>
          {research.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
        </div>}
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[11px] leading-5 text-slate-300">{research.report}</pre>
        {research.citations.length > 0 && <div className="space-y-2">
          <p className="text-xs font-bold text-white">{dari ? 'منابع با استناد' : 'Cited sources'}</p>
          {research.citations.map((citation) => <article key={citation.index} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${badge} ${verificationTone(citation.verification)}`}><ShieldCheck className="h-3 w-3" />{citation.verification}</span>
              <span className={`${badge} border-slate-700 bg-slate-900 text-slate-400`}>{citation.domain}</span>
              {citation.publishedAt && <span className="text-[10px] text-slate-500">{new Date(citation.publishedAt).toLocaleDateString()}</span>}
            </div>
            <p className="mt-1 text-xs font-semibold text-white">{citation.title}</p>
            <a href={citation.url} target="_blank" rel="noreferrer" className="break-all text-[10px] text-cyan-300 underline">{citation.url}</a>
          </article>)}
        </div>}
      </div>}
    </section>

    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-cyan-300" /><h3 className="font-bold text-white">{dari ? 'دانش ذخیره‌شده من' : 'My saved knowledge'}</h3></div>
        <button onClick={() => void refreshStale()} disabled={busy || !status?.staleDocuments} className="inline-flex items-center gap-1 rounded-xl border border-amber-700/50 px-3 py-1.5 text-[10px] font-bold text-amber-200 disabled:opacity-40">
          <RefreshCw className="h-3 w-3" />{dari ? 'به‌روزرسانی منابع قدیمی' : 'Refresh stale sources'}
        </button>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[11px] font-bold text-slate-300">{dari ? 'افزودن یادداشت یا متن مرجع' : 'Add a note or reference text'}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={inputClass} value={addTitle} maxLength={180} onChange={(e) => setAddTitle(e.target.value)} placeholder={dari ? 'عنوان' : 'Title'} />
          <select className={inputClass} value={addCategory} onChange={(e) => setAddCategory(e.target.value)}>
            <option value="">{dari ? 'دسته خودکار' : 'Auto category'}</option>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input className={inputClass} value={addSourceUrl} maxLength={2048} onChange={(e) => setAddSourceUrl(e.target.value)} placeholder={dari ? 'نشانی منبع (اختیاری)' : 'Source URL (optional)'} />
        </div>
        <textarea className={inputClass} rows={4} maxLength={400000} value={addContent} onChange={(e) => setAddContent(e.target.value)} placeholder={dari ? 'متن دانش را اینجا وارد کنید...' : 'Paste knowledge text here...'} />
        <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{addContent.length.toLocaleString()} / 400,000</span><button onClick={() => void addNote()} disabled={busy || addTitle.trim().length < 1 || addContent.trim().length < 20} className="rounded-xl bg-cyan-400 px-4 py-2 text-[10px] font-black text-slate-950 disabled:opacity-40">{dari ? 'ذخیره دانش' : 'Save knowledge'}</button></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(query, category); }} maxLength={500} placeholder={dari ? 'جست‌وجو در دانش من...' : 'Search my knowledge...'} />
        <select className={inputClass + ' sm:max-w-44'} value={category} onChange={(e) => { setCategory(e.target.value); void load(query, e.target.value); }}>
          <option value="">{dari ? 'همه دسته‌ها' : 'All categories'}</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button onClick={() => void load(query, category)} disabled={busy} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40"><Search className="inline h-4 w-4" /></button>
      </div>
      <p className="text-[10px] text-slate-500">{total.toLocaleString()} {dari ? 'سند' : 'documents'}</p>
      <div className="space-y-2">
        {documents.map((doc) => <article key={doc.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{doc.title}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className={`${badge} border-slate-700 bg-slate-900 text-slate-400`}>{doc.category}</span>
                <span className={`${badge} ${verificationTone(doc.verification)}`}><ShieldCheck className="h-3 w-3" />{doc.verification}</span>
                {doc.sourceUrl && <span className={`${badge} border-slate-700 bg-slate-900 text-slate-400`}><Globe2 className="h-3 w-3" />{doc.sourceLabel || 'web'}</span>}
                {doc.refreshAfter && new Date(doc.refreshAfter).getTime() <= Date.now() && <span className={`${badge} border-amber-500/30 bg-amber-500/10 text-amber-200`}><AlertTriangle className="h-3 w-3" />{dari ? 'قدیمی' : 'stale'}</span>}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">{cleanSnippet(doc.snippet || doc.summary)}</p>
              {doc.sourceUrl && <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-[10px] text-cyan-300 underline">{doc.sourceUrl}</a>}
            </div>
            <div className="flex shrink-0 gap-1">
              <button aria-label="Inspect knowledge" onClick={() => void openDocument(doc.id)} className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:text-cyan-300"><FileText className="h-3.5 w-3.5" /></button>
              {doc.sourceUrl && <button aria-label="Refresh source" onClick={() => void refreshOne(doc.id)} disabled={busy} className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:text-amber-300 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /></button>}
              <button aria-label="Delete knowledge" onClick={() => void removeDocument(doc.id)} disabled={busy} className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:text-rose-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </article>)}
        {!documents.length && <p className="text-xs text-slate-500">{dari ? 'هنوز دانشی ذخیره نشده است. یک تحقیق عمیق اجرا کنید یا یادداشت اضافه کنید.' : 'No knowledge saved yet. Run deep research or add a note.'}</p>}
      </div>
      {selected && <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-900/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div><p className="text-sm font-bold text-white">{selected.document.title}</p><p className="text-[10px] text-slate-500">{selected.document.category} · {selected.document.verification} · {selected.document.characterCount.toLocaleString()} {dari ? 'نویسه' : 'characters'} · {selected.chunks.length} {dari ? 'قطعه' : 'chunks'}</p></div>
          <div className="flex gap-1">
            <button onClick={() => setEditing((value) => !value)} className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300"><Pencil className="mr-1 inline h-3 w-3" />{dari ? 'اصلاح' : 'Correct'}</button>
            <button onClick={() => setSelected(null)} className="rounded-lg border border-slate-700 p-1 text-slate-400"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {selected.researchOrigin && <p className="text-[10px] text-violet-200">{dari ? 'منبع تحقیق' : 'Research origin'}: {selected.researchOrigin.query} ({selected.researchOrigin.depth})</p>}
        {editing ? <div className="space-y-2">
          <input className={inputClass} value={editTitle} maxLength={180} onChange={(e) => setEditTitle(e.target.value)} placeholder={dari ? 'عنوان' : 'Title'} />
          <select className={inputClass} value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <textarea className={inputClass} rows={3} maxLength={2000} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder={dari ? 'خلاصه' : 'Summary'} />
          <textarea className={inputClass} rows={10} maxLength={400000} value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder={dari ? 'متن کامل' : 'Full text'} />
          <p className="text-[10px] text-amber-200">{dari ? 'اصلاح شما با برچسب user_corrected ذخیره می‌شود؛ ادعای تأیید خودکار نمی‌کنیم.' : 'Your edit is labeled user_corrected; this is not automatic verification.'}</p>
          <div className="flex gap-2"><button onClick={() => void saveEdit()} disabled={busy || !editTitle.trim() || editContent.trim().length < 20} className="rounded-xl bg-cyan-400 px-3 py-1.5 text-[10px] font-black text-slate-950 disabled:opacity-40"><Check className="mr-1 inline h-3 w-3" />{dari ? 'ذخیره اصلاح' : 'Save correction'}</button><button onClick={() => setEditing(false)} className="rounded-xl border border-slate-700 px-3 py-1.5 text-[10px] text-slate-300">{dari ? 'لغو' : 'Cancel'}</button></div>
        </div> : <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">{selected.content.slice(0, 20000)}{selected.content.length > 20000 ? '\n\n…' : ''}</pre>}
      </div>}
    </section>

    <p className="text-[10px] leading-5 text-slate-500">{dari ? 'دانش ذخیره‌شده فقط به حساب شما تعلق دارد. متن منابع خارجی داده غیرقابل‌اعتماد است و هرگز دستور اجرا نمی‌شود. برچسب multi_source فقط هم‌پوشانی واژگانی را نشان می‌دهد، نه تأیید مستقل حقیقت.' : 'Stored knowledge is private to your account. External source text is untrusted data and is never executed as instructions. A multi_source label reflects lexical overlap only, not independent fact-checking.'}</p>
  </div>;
};
