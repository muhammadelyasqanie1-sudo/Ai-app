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
  const locale=language==='dari'||language==='pashto'||language==='arabic'?language:'english';
  const dari=locale==='dari';
  const rtl=['dari','pashto','persian','arabic','urdu'].includes(language);
  const knowledgePs:Record<string,string>={
    'Could not load the knowledge engine.':'د پوهې انجن بار نه شو.','Deep research failed.':'ژوره څېړنه ناکامه شوه.','This exact text already exists in your knowledge base.':'دا عین متن ستاسو د پوهې په زېرمه کې شته.','Knowledge saved and chunked for retrieval.':'پوهه خوندي او د لټون لپاره په برخو ووېشل شوه.','Could not save the knowledge.':'پوهه خوندي نه شوه.','Could not open the document.':'سند پرانیستل نه شو.','Your correction was saved.':'ستاسو سمون خوندي شو.','Could not save the correction.':'سمون خوندي نه شو.','Delete this knowledge document permanently?':'دا د پوهې سند د تل لپاره ړنګ شي؟','Knowledge document deleted.':'د پوهې سند ړنګ شو.','Could not delete the document.':'سند ړنګ نه شو.','The source changed, but your correction was preserved.':'سرچینه بدله شوې، خو ستاسو سمون خوندي پاتې شو.','The source changed and the knowledge was refreshed.':'سرچینه بدله شوه او پوهه تازه شوه.','The source is still current.':'سرچینه لا هم تازه ده.','Could not refresh the source.':'سرچینه تازه نه شوه.','No stale knowledge found.':'زړه پوهه ونه موندل شوه.','Could not refresh stale knowledge.':'زړې سرچینې تازه نه شوې.',
    'Self-learning knowledge engine':'د ځان‌زده‌کړې د پوهې انجن','Multi-source research, cited storage, retrieval, correction and freshness':'څو سرچینه‌ییزه څېړنه، له حوالو سره زېرمه، لټون، سمون او تازه‌والی','Refresh':'تازه کول','Documents':'اسناد','Retrieval chunks':'د ترلاسه کولو برخې','Stale sources':'زړې سرچینې','Research runs / hour':'په ساعت کې د څېړنې شمېر','Full-text search':'بشپړ متني لټون','Embedding rerank':'د Embedding بیا درجه‌بندي','Embeddings not configured':'Embeddings نه دي تنظیم شوي','Web search ready':'وېب لټون چمتو دی','Web search not configured':'وېب لټون نه دی تنظیم شوی','Browser reading ready':'د براوزر لوستل چمتو دي','Browser reading not configured':'د براوزر لوستل نه دي تنظیم شوي','Deep research':'ژوره څېړنه',
    'Tavily searches; in deep mode Browserbase opens public pages in an isolated session. Provider-supplied text or the opened page becomes evidence, and unread sources are reported explicitly. Neither guarantees the complete page.':'Tavily لټون کوي؛ په ژور حالت کې Browserbase عامې پاڼې په جلا ناسته کې پرانیزي. د برابرونکي متن یا پرانیستل شوې پاڼه د شواهدو په توګه کارېږي او نه لوستل شوې سرچینې جلا ښودل کېږي؛ د بشپړتیا ضمانت نشته.',
    'What should AFG AI research? e.g. current best practices for RAG in 2026':'AFG AI د څه په اړه وڅېړي؟ لکه په ۲۰۲۶ کې د RAG غوره لارې چارې',
    'Standard (faster)':'معیاري (چټک)','Deep (browser reading)':'ژور (د براوزر لوستل)','Auto category':'اتومات کټګوري','Save to my private knowledge':'زما شخصي پوهې ته یې خوندي کړئ','Researching...':'څېړنه روانه ده...','Research and save':'څېړنه او خوندي کول','new':'نوی','deduplicated':'تکراري سره ونښلول شو','citations':'حوالې','Warnings':'خبرداري','Cited sources':'حواله شوې سرچینې','My saved knowledge':'زما خوندي شوې پوهه','Refresh stale sources':'زړې سرچینې تازه کول','Add a note or reference text':'یادښت یا مرجع متن زیات کړئ','Title':'سرلیک','Source URL (optional)':'د سرچینې لینک (اختیاري)','Paste knowledge text here...':'د پوهې متن دلته ونښلوئ...','Save knowledge':'پوهه خوندي کول','Search my knowledge...':'زما پوهه ولټوئ...','All categories':'ټولې کټګورۍ','documents':'سندونه','stale':'زړې','No knowledge saved yet. Run deep research or add a note.':'تر اوسه پوهه نه ده خوندي شوې. ژوره څېړنه وکړئ یا یادښت زیات کړئ.','characters':'توري','chunks':'برخې','Correct':'سمون','Research origin':'د څېړنې سرچینه','Summary':'لنډیز','Full text':'بشپړ متن','Your edit is labeled user_corrected; this is not automatic verification.':'ستاسو سمون د user_corrected په نوم نښه کېږي؛ دا اتومات تایید نه دی.','Save correction':'سمون خوندي کول','Cancel':'لغوه کول',
    'Stored knowledge is private to your account. External source text is untrusted data and is never executed as instructions. A multi_source label reflects lexical overlap only, not independent fact-checking.':'خوندي شوې پوهه یوازې ستاسو حساب پورې اړه لري. د بهرنیو سرچینو متن ناتایید شوی معلومات دي او هېڅکله د لارښوونې په توګه نه اجرا کېږي. د multi_source نښه یوازې د کلمو ورته‌والی ښيي، نه خپلواک حقیقت‌سنجونه.'
  };
  const knowledgeAr:Record<string,string>={
    'Could not load the knowledge engine.':'تعذر تحميل محرك المعرفة.','Deep research failed.':'فشل البحث المتعمق.','This exact text already exists in your knowledge base.':'هذا النص نفسه موجود بالفعل في قاعدة معرفتك.','Knowledge saved and chunked for retrieval.':'تم حفظ المعرفة وتقسيمها إلى أجزاء للاسترجاع.','Could not save the knowledge.':'تعذر حفظ المعرفة.','Could not open the document.':'تعذر فتح المستند.','Your correction was saved.':'تم حفظ تصحيحك.','Could not save the correction.':'تعذر حفظ التصحيح.','Delete this knowledge document permanently?':'هل تريد حذف مستند المعرفة نهائياً؟','Knowledge document deleted.':'تم حذف مستند المعرفة.','Could not delete the document.':'تعذر حذف المستند.','The source changed, but your correction was preserved.':'تغيّر المصدر لكن تم الاحتفاظ بتصحيحك.','The source changed and the knowledge was refreshed.':'تغيّر المصدر وتم تحديث المعرفة.','The source is still current.':'لا يزال المصدر حديثاً.','Could not refresh the source.':'تعذر تحديث المصدر.','No stale knowledge found.':'لم يتم العثور على معرفة قديمة.','Could not refresh stale knowledge.':'تعذر تحديث المصادر القديمة.',
    'Self-learning knowledge engine':'محرك المعرفة ذاتي التعلم','Multi-source research, cited storage, retrieval, correction and freshness':'بحث متعدد المصادر وحفظ موثق واسترجاع وتصحيح وتحديث','Refresh':'تحديث','Documents':'المستندات','Retrieval chunks':'أجزاء الاسترجاع','Stale sources':'مصادر قديمة','Research runs / hour':'عمليات البحث في الساعة','Full-text search':'بحث كامل النص','Embedding rerank':'إعادة ترتيب التضمينات','Embeddings not configured':'لم يتم إعداد التضمينات','Web search ready':'بحث الويب جاهز','Web search not configured':'لم يتم إعداد بحث الويب','Browser reading ready':'قراءة المتصفح جاهزة','Browser reading not configured':'لم يتم إعداد قراءة المتصفح','Deep research':'بحث متعمق',
    'Tavily searches; in deep mode Browserbase opens public pages in an isolated session. Provider-supplied text or the opened page becomes evidence, and unread sources are reported explicitly. Neither guarantees the complete page.':'يبحث Tavily؛ وفي الوضع المتعمق يفتح Browserbase الصفحات العامة في جلسة معزولة. يصبح النص المقدم من المزوّد أو الصفحة المفتوحة دليلاً، ويتم الإبلاغ صراحة عن المصادر غير المقروءة. ولا يضمن أي منهما الصفحة كاملة.',
    'What should AFG AI research? e.g. current best practices for RAG in 2026':'ما الموضوع الذي تريد من AFG AI بحثه؟ مثلاً أفضل ممارسات RAG في 2026',
    'Standard (faster)':'قياسي (أسرع)','Deep (browser reading)':'متعمق (قراءة المتصفح)','Auto category':'تصنيف تلقائي','Save to my private knowledge':'احفظ في معرفتي الخاصة','Researching...':'جارٍ البحث...','Research and save':'ابحث واحفظ','new':'جديد','deduplicated':'تم دمج التكرار','citations':'استشهادات','Warnings':'تحذيرات','Cited sources':'المصادر المستشهد بها','My saved knowledge':'معرفتي المحفوظة','Refresh stale sources':'تحديث المصادر القديمة','Add a note or reference text':'إضافة ملاحظة أو نص مرجعي','Title':'العنوان','Source URL (optional)':'رابط المصدر (اختياري)','Paste knowledge text here...':'الصق نص المعرفة هنا...','Save knowledge':'حفظ المعرفة','Search my knowledge...':'ابحث في معرفتي...','All categories':'جميع الفئات','documents':'مستندات','stale':'قديمة','No knowledge saved yet. Run deep research or add a note.':'لم يتم حفظ معرفة بعد. أجرِ بحثاً متعمقاً أو أضف ملاحظة.','characters':'أحرف','chunks':'أجزاء','Correct':'تصحيح','Research origin':'مصدر البحث','Summary':'ملخص','Full text':'النص الكامل','Your edit is labeled user_corrected; this is not automatic verification.':'يتم وضع علامة user_corrected على تعديلك؛ وهذا ليس تحققاً تلقائياً.','Save correction':'حفظ التصحيح','Cancel':'إلغاء',
    'Stored knowledge is private to your account. External source text is untrusted data and is never executed as instructions. A multi_source label reflects lexical overlap only, not independent fact-checking.':'المعرفة المحفوظة خاصة بحسابك. نصوص المصادر الخارجية بيانات غير موثوقة ولا تُنفذ أبداً كتعليمات. تشير علامة multi_source إلى التشابه اللفظي فقط وليس إلى تحقق مستقل من الحقائق.'
  };
  const knowledgeText=(d:string,e:string)=>locale==='dari'?d:locale==='pashto'?(knowledgePs[e]||e):locale==='arabic'?(knowledgeAr[e]||e):e;
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
      setError(e instanceof Error ? e.message : (knowledgeText('بارگذاری موتور دانش ناموفق بود.','Could not load the knowledge engine.')));
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
      setError(e instanceof Error ? e.message : (knowledgeText('تحقیق انجام نشد.','Deep research failed.')));
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
        ? (knowledgeText('این متن از قبل در دانش شما وجود داشت.','This exact text already exists in your knowledge base.'))
        : (knowledgeText('دانش جدید ذخیره و قطعه‌بندی شد.','Knowledge saved and chunked for retrieval.')));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (knowledgeText('ذخیره دانش ناموفق بود.','Could not save the knowledge.')));
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
      setError(e instanceof Error ? e.message : (knowledgeText('سند باز نشد.','Could not open the document.')));
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
      setNotice(knowledgeText('اصلاح شما ذخیره شد.','Your correction was saved.'));
      setEditing(false);
      await openDocument(selected.document.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (knowledgeText('اصلاح ذخیره نشد.','Could not save the correction.')));
    } finally { setBusy(false); }
  };

  const removeDocument = async (id: string) => {
    if (!window.confirm(knowledgeText('این سند دانش برای همیشه حذف شود؟','Delete this knowledge document permanently?'))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/knowledge/' + id, { method: 'DELETE' });
      if (selected?.document.id === id) setSelected(null);
      setNotice(knowledgeText('سند حذف شد.','Knowledge document deleted.'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (knowledgeText('حذف ناموفق بود.','Could not delete the document.')));
    } finally { setBusy(false); }
  };

  const refreshOne = async (id: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/knowledge/' + id + '/refresh', { method: 'POST' });
      setNotice(result.preserved
        ? (knowledgeText('منبع تغییر کرده بود، اما اصلاح شما حفظ شد.','The source changed, but your correction was preserved.'))
        : result.changed
          ? (knowledgeText('منبع تغییر کرده بود و دانش به‌روزرسانی شد.','The source changed and the knowledge was refreshed.'))
          : (knowledgeText('منبع هنوز به‌روز است.','The source is still current.')));
      await load();
      if (selected?.document.id === id) await openDocument(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : (knowledgeText('تازه‌سازی ناموفق بود.','Could not refresh the source.')));
    } finally { setBusy(false); }
  };

  const refreshStale = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const stale = await request('/api/knowledge/stale?limit=5');
      const rows = Array.isArray(stale.documents) ? stale.documents : [];
      if (!rows.length) { setNotice(knowledgeText('هیچ دانش قدیمی وجود ندارد.','No stale knowledge found.')); return; }
      let refreshed = 0;
      for (const row of rows) {
        try { await request('/api/knowledge/' + row.id + '/refresh', { method: 'POST' }); refreshed += 1; }
        catch { /* Keep refreshing the remaining independent sources. */ }
      }
      setNotice(dari ? `${refreshed} منبع بررسی شد.` : `${refreshed} source(s) checked.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (knowledgeText('به‌روزرسانی منابع قدیمی ناموفق بود.','Could not refresh stale knowledge.')));
    } finally { setBusy(false); }
  };

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white placeholder:text-slate-500';
  const cardClass = 'space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4';
  const badge = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold';

  return <div className="space-y-5" dir={rtl ? 'rtl' : 'ltr'}>
    <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/50 to-violet-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-cyan-300" />
          <div>
            <h3 className="font-black text-white">{knowledgeText('موتور دانش خودآموز','Self-learning knowledge engine')}</h3>
            <p className="text-xs text-slate-400">{knowledgeText('تحقیق چندمنبعی، ذخیره با استناد، جست‌وجو، اصلاح و به‌روزرسانی','Multi-source research, cited storage, retrieval, correction and freshness')}</p>
          </div>
        </div>
        <button onClick={() => void load(query, category)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{knowledgeText('تازه‌سازی','Refresh')}
        </button>
      </div>
      {status && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [knowledgeText('اسناد','Documents'), status.documents],
          [knowledgeText('قطعه‌های قابل بازیابی','Retrieval chunks'), status.chunks],
          [knowledgeText('نیازمند به‌روزرسانی','Stale sources'), status.staleDocuments],
          [knowledgeText('تحقیق در یک ساعت','Research runs / hour'), status.researchRunsLastHour],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-[10px] text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-cyan-200">{Number(value || 0).toLocaleString()}</p>
        </div>)}
      </div>}
      {status?.capabilities && <div className="mt-3 flex flex-wrap gap-2">
        <span className={`${badge} border-cyan-500/30 bg-cyan-500/10 text-cyan-200`}><Search className="h-3 w-3" />{knowledgeText('جست‌وجوی متنی کامل','Full-text search')}</span>
        <span className={`${badge} ${status.capabilities.vectorSearch ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}><Sparkles className="h-3 w-3" />{status.capabilities.vectorSearch ? (knowledgeText('رتبه‌بندی امبدینگ','Embedding rerank')) : (knowledgeText('امبدینگ پیکربندی نشده','Embeddings not configured'))}</span>
        <span className={`${badge} ${status.capabilities.webSearch ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}><Globe2 className="h-3 w-3" />{status.capabilities.webSearch ? (knowledgeText('جست‌وجوی وب آماده','Web search ready')) : (knowledgeText('جست‌وجوی وب پیکربندی نشده','Web search not configured'))}</span>
        <span className={`${badge} ${status.capabilities.browserReading ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}><Globe2 className="h-3 w-3" />{status.capabilities.browserReading ? (knowledgeText('خواندن با مرورگر','Browser reading ready')) : (knowledgeText('مرورگر پیکربندی نشده','Browser reading not configured'))}</span>
      </div>}
    </div>

    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}

    <section className={cardClass}>
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-300" /><h3 className="font-bold text-white">{knowledgeText('تحقیق عمیق','Deep research')}</h3></div>
      <p className="text-xs leading-5 text-slate-400">{knowledgeText('Tavily جست‌وجو می‌کند و در حالت عمیق، Browserbase صفحات عمومی را در یک نشست جداگانه می‌خواند. متن ارائه‌شده توسط جست‌وجو یا صفحه بازشده به‌عنوان شاهد استفاده می‌شود و منابع خوانده‌نشده صریحاً گزارش می‌شوند؛ هیچ‌کدام تضمین کامل‌بودن صفحه نیست.','Tavily searches; in deep mode Browserbase opens public pages in an isolated session. Provider-supplied text or the opened page becomes evidence, and unread sources are reported explicitly. Neither guarantees the complete page.')}</p>
      <textarea className={inputClass} rows={3} maxLength={500} value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} placeholder={knowledgeText('چه چیزی را باید تحقیق کنم؟ مثلاً: بهترین روش‌های RAG در سال ۲۰۲۶','What should AFG AI research? e.g. current best practices for RAG in 2026')} />
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={inputClass} value={researchDepth} onChange={(e) => setResearchDepth(e.target.value === 'deep' ? 'deep' : 'standard')}>
          <option value="standard">{knowledgeText('استاندارد (سریع‌تر)','Standard (faster)')}</option>
          <option value="deep">{knowledgeText('عمیق (خواندن با مرورگر)','Deep (browser reading)')}</option>
        </select>
        <select className={inputClass} value={researchCategory} onChange={(e) => setResearchCategory(e.target.value)}>
          <option value="">{knowledgeText('دسته خودکار','Auto category')}</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300">
          <input type="checkbox" checked={saveResearch} onChange={(e) => setSaveResearch(e.target.checked)} className="accent-cyan-400" />
          {knowledgeText('ذخیره در دانش خصوصی من','Save to my private knowledge')}
        </label>
      </div>
      <button disabled={researchBusy || researchQuery.trim().length < 3 || !status} onClick={() => void runResearch()} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
        {researchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {researchBusy ? (knowledgeText('در حال تحقیق...','Researching...')) : (knowledgeText('تحقیق و ذخیره','Research and save'))}
      </button>
      {research && <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className={`${badge} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`}><Check className="h-3 w-3" />{research.savedDocuments} {knowledgeText('سند جدید','new')}</span>
          <span className={`${badge} border-cyan-500/30 bg-cyan-500/10 text-cyan-200`}><Link2 className="h-3 w-3" />{research.deduplicatedDocuments} {knowledgeText('تکراری پیوند شد','deduplicated')}</span>
          <span className={`${badge} border-slate-600 bg-slate-800 text-slate-300`}><FileText className="h-3 w-3" />{research.citations.length} {knowledgeText('استناد','citations')}</span>
        </div>
        {research.warnings.length > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          <p className="mb-1 flex items-center gap-1 font-bold"><AlertTriangle className="h-3 w-3" />{knowledgeText('هشدارها','Warnings')}</p>
          {research.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
        </div>}
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[11px] leading-5 text-slate-300">{research.report}</pre>
        {research.citations.length > 0 && <div className="space-y-2">
          <p className="text-xs font-bold text-white">{knowledgeText('منابع با استناد','Cited sources')}</p>
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
        <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-cyan-300" /><h3 className="font-bold text-white">{knowledgeText('دانش ذخیره‌شده من','My saved knowledge')}</h3></div>
        <button onClick={() => void refreshStale()} disabled={busy || !status?.staleDocuments} className="inline-flex items-center gap-1 rounded-xl border border-amber-700/50 px-3 py-1.5 text-[10px] font-bold text-amber-200 disabled:opacity-40">
          <RefreshCw className="h-3 w-3" />{knowledgeText('به‌روزرسانی منابع قدیمی','Refresh stale sources')}
        </button>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[11px] font-bold text-slate-300">{knowledgeText('افزودن یادداشت یا متن مرجع','Add a note or reference text')}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={inputClass} value={addTitle} maxLength={180} onChange={(e) => setAddTitle(e.target.value)} placeholder={knowledgeText('عنوان','Title')} />
          <select className={inputClass} value={addCategory} onChange={(e) => setAddCategory(e.target.value)}>
            <option value="">{knowledgeText('دسته خودکار','Auto category')}</option>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input className={inputClass} value={addSourceUrl} maxLength={2048} onChange={(e) => setAddSourceUrl(e.target.value)} placeholder={knowledgeText('نشانی منبع (اختیاری)','Source URL (optional)')} />
        </div>
        <textarea className={inputClass} rows={4} maxLength={400000} value={addContent} onChange={(e) => setAddContent(e.target.value)} placeholder={knowledgeText('متن دانش را اینجا وارد کنید...','Paste knowledge text here...')} />
        <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{addContent.length.toLocaleString()} / 400,000</span><button onClick={() => void addNote()} disabled={busy || addTitle.trim().length < 1 || addContent.trim().length < 20} className="rounded-xl bg-cyan-400 px-4 py-2 text-[10px] font-black text-slate-950 disabled:opacity-40">{knowledgeText('ذخیره دانش','Save knowledge')}</button></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(query, category); }} maxLength={500} placeholder={knowledgeText('جست‌وجو در دانش من...','Search my knowledge...')} />
        <select className={inputClass + ' sm:max-w-44'} value={category} onChange={(e) => { setCategory(e.target.value); void load(query, e.target.value); }}>
          <option value="">{knowledgeText('همه دسته‌ها','All categories')}</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button onClick={() => void load(query, category)} disabled={busy} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40"><Search className="inline h-4 w-4" /></button>
      </div>
      <p className="text-[10px] text-slate-500">{total.toLocaleString()} {knowledgeText('سند','documents')}</p>
      <div className="space-y-2">
        {documents.map((doc) => <article key={doc.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{doc.title}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className={`${badge} border-slate-700 bg-slate-900 text-slate-400`}>{doc.category}</span>
                <span className={`${badge} ${verificationTone(doc.verification)}`}><ShieldCheck className="h-3 w-3" />{doc.verification}</span>
                {doc.sourceUrl && <span className={`${badge} border-slate-700 bg-slate-900 text-slate-400`}><Globe2 className="h-3 w-3" />{doc.sourceLabel || 'web'}</span>}
                {doc.refreshAfter && new Date(doc.refreshAfter).getTime() <= Date.now() && <span className={`${badge} border-amber-500/30 bg-amber-500/10 text-amber-200`}><AlertTriangle className="h-3 w-3" />{knowledgeText('قدیمی','stale')}</span>}
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
        {!documents.length && <p className="text-xs text-slate-500">{knowledgeText('هنوز دانشی ذخیره نشده است. یک تحقیق عمیق اجرا کنید یا یادداشت اضافه کنید.','No knowledge saved yet. Run deep research or add a note.')}</p>}
      </div>
      {selected && <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-900/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div><p className="text-sm font-bold text-white">{selected.document.title}</p><p className="text-[10px] text-slate-500">{selected.document.category} · {selected.document.verification} · {selected.document.characterCount.toLocaleString()} {knowledgeText('نویسه','characters')} · {selected.chunks.length} {knowledgeText('قطعه','chunks')}</p></div>
          <div className="flex gap-1">
            <button onClick={() => setEditing((value) => !value)} className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300"><Pencil className="mr-1 inline h-3 w-3" />{knowledgeText('اصلاح','Correct')}</button>
            <button onClick={() => setSelected(null)} className="rounded-lg border border-slate-700 p-1 text-slate-400"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {selected.researchOrigin && <p className="text-[10px] text-violet-200">{knowledgeText('منبع تحقیق','Research origin')}: {selected.researchOrigin.query} ({selected.researchOrigin.depth})</p>}
        {editing ? <div className="space-y-2">
          <input className={inputClass} value={editTitle} maxLength={180} onChange={(e) => setEditTitle(e.target.value)} placeholder={knowledgeText('عنوان','Title')} />
          <select className={inputClass} value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <textarea className={inputClass} rows={3} maxLength={2000} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder={knowledgeText('خلاصه','Summary')} />
          <textarea className={inputClass} rows={10} maxLength={400000} value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder={knowledgeText('متن کامل','Full text')} />
          <p className="text-[10px] text-amber-200">{knowledgeText('اصلاح شما با برچسب user_corrected ذخیره می‌شود؛ ادعای تأیید خودکار نمی‌کنیم.','Your edit is labeled user_corrected; this is not automatic verification.')}</p>
          <div className="flex gap-2"><button onClick={() => void saveEdit()} disabled={busy || !editTitle.trim() || editContent.trim().length < 20} className="rounded-xl bg-cyan-400 px-3 py-1.5 text-[10px] font-black text-slate-950 disabled:opacity-40"><Check className="mr-1 inline h-3 w-3" />{knowledgeText('ذخیره اصلاح','Save correction')}</button><button onClick={() => setEditing(false)} className="rounded-xl border border-slate-700 px-3 py-1.5 text-[10px] text-slate-300">{knowledgeText('لغو','Cancel')}</button></div>
        </div> : <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">{selected.content.slice(0, 20000)}{selected.content.length > 20000 ? '\n\n…' : ''}</pre>}
      </div>}
    </section>

    <p className="text-[10px] leading-5 text-slate-500">{knowledgeText('دانش ذخیره‌شده فقط به حساب شما تعلق دارد. متن منابع خارجی داده غیرقابل‌اعتماد است و هرگز دستور اجرا نمی‌شود. برچسب multi_source فقط هم‌پوشانی واژگانی را نشان می‌دهد، نه تأیید مستقل حقیقت.','Stored knowledge is private to your account. External source text is untrusted data and is never executed as instructions. A multi_source label reflects lexical overlap only, not independent fact-checking.')}</p>
  </div>;
};
