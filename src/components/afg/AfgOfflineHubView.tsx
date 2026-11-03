import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, Cpu, HardDrive, MessageSquare, Search, ShieldCheck, Sparkles, Trash2, WifiOff, X } from 'lucide-react';
import type { Language } from '../../types/afg';

type CatalogModel = {
  model_id: string;
  vram_required_MB?: number;
  low_resource_required?: boolean;
  model?: unknown;
};
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type RuntimeState = 'checking' | 'ready' | 'unsupported' | 'error';

const INSTALLED_KEY = 'afg-ai-offline-hub-installed-v1';

function formatBytes(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return value.toFixed(value >= 10 || unit === 0 ? 0 : 1) + ' ' + units[unit];
}

function getHuggingFaceRepo(model: CatalogModel): string | null {
  const config = model.model as { model_url?: string } | string | undefined;
  const raw = typeof config === 'string' ? config : config?.model_url;
  if (!raw || !raw.startsWith('https://huggingface.co/')) return null;
  try {
    const parts = new URL(raw).pathname.split('/').filter(Boolean);
    const resolveIndex = parts.indexOf('resolve');
    const repoParts = resolveIndex >= 0 ? parts.slice(0, resolveIndex) : parts.slice(0, 2);
    return repoParts.length >= 2 ? repoParts.slice(0, 2).join('/') : null;
  } catch { return null; }
}

export function AfgOfflineHubView({ language }: { language: Language }) {
  const dari = language === 'dari';
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [runtime, setRuntime] = useState<RuntimeState>('checking');
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const [modelSizes, setModelSizes] = useState<Record<string, number | null>>({});
  const [installed, setInstalled] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(INSTALLED_KEY) || '[]'); } catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const engineRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const copy = dari ? {
    title: 'مرکز هوش مصنوعی آفلاین', subtitle: 'مدل را یک‌بار دانلود کن و در همین دستگاه، بدون اینترنت از آن استفاده کن.',
    runtime: 'وضعیت موتور محلی', compatible: 'این دستگاه از WebGPU پشتیبانی می‌کند.', unsupported: 'این مرورگر یا WebView از WebGPU پشتیبانی نمی‌کند؛ اجرای مدل آفلاین در این دستگاه فعلاً فعال نیست.',
    checking: 'در حال بررسی سخت‌افزار…', catalog: 'مدل‌های سازگار', search: 'جست‌وجوی مدل…', install: 'دانلود و نصب', installed: 'ذخیره‌شده', downloading: 'در حال دانلود مدل…',
    minMemory: 'حداقل حافظه گرافیکی', downloadSize: 'حجم فایل‌ها', unknownSize: 'حجم دقیق از منبع اعلام نشده', storage: 'فضای ذخیره‌سازی دستگاه',
    chat: 'گفت‌وگوی آفلاین', chatHint: 'مدل نصب‌شده را بارگذاری کن و بدون اتصال به سرور پیام بده.', choose: 'یک مدل انتخاب کن', load: 'بارگذاری مدل', send: 'ارسال', input: 'پیام خود را بنویس…',
    noModels: 'مدل سازگاری پیدا نشد.', noInstalled: 'هنوز مدلی نصب نشده است.', loading: 'در حال بارگذاری مدل…', ready: 'مدل آماده است؛ پیام‌ها فقط روی همین دستگاه پردازش می‌شوند.',
    failed: 'عملیات انجام نشد. فضای خالی و سازگاری دستگاه را بررسی کن.', remove: 'فراموش‌کردن مدل', privacy: 'حریم خصوصی: متن گفتگو به سرور AFG AI ارسال نمی‌شود.',
    source: 'منبع مدل: MLC / WebLLM', limitation: 'این فهرست، مدل‌های از پیش تبدیل‌شده و سازگار با WebLLM را نشان می‌دهد؛ همه فایل‌های GGUF یا همه مدل‌های Hugging Face قابل اجرا نیستند.',
    onlineNeeded: 'برای دانلود اولیه به اینترنت نیاز است. پس از ذخیره موفق، اجرای مدل می‌تواند آفلاین باشد.',
  } : {
    title: 'Offline AI Hub', subtitle: 'Download a model once, then use it on this device without an internet connection.',
    runtime: 'Local runtime status', compatible: 'This device supports WebGPU.', unsupported: 'This browser or WebView does not support WebGPU. Offline model inference is unavailable on this device for now.',
    checking: 'Checking device capabilities…', catalog: 'Compatible models', search: 'Search models…', install: 'Download & install', installed: 'Cached', downloading: 'Downloading model…',
    minMemory: 'Minimum GPU memory', downloadSize: 'Model files', unknownSize: 'Exact size not published by source', storage: 'Device storage',
    chat: 'Offline chat', chatHint: 'Load an installed model and chat without sending requests to a server.', choose: 'Choose a model', load: 'Load model', send: 'Send', input: 'Write a message…',
    noModels: 'No compatible models found.', noInstalled: 'No models installed yet.', loading: 'Loading model…', ready: 'Model ready. Messages are processed on this device only.',
    failed: 'Operation failed. Check free storage and device compatibility.', remove: 'Forget model', privacy: 'Privacy: chat text is not sent to AFG AI servers.',
    source: 'Model source: MLC / WebLLM', limitation: 'This catalog lists pre-converted models compatible with WebLLM. Not every GGUF file or every Hugging Face model can run here.',
    onlineNeeded: 'An internet connection is required for the first download. Once cached, the model can run offline.',
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
        if (!gpu) {
          if (active) { setRuntime('unsupported'); setRuntimeMessage(copy.unsupported); }
          return;
        }
        const adapter = await gpu.requestAdapter();
        if (!active) return;
        if (!adapter) { setRuntime('unsupported'); setRuntimeMessage(copy.unsupported); return; }
        const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
        if (!active) return;
        const catalog = (prebuiltAppConfig.model_list || []) as CatalogModel[];
        setModels(catalog);
        setSelectedId(catalog[0]?.model_id || '');
        setRuntime('ready');
        setRuntimeMessage(copy.compatible);
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          if (active) setStorage({ usage: estimate.usage, quota: estimate.quota });
        }
      } catch {
        if (active) { setRuntime('error'); setRuntimeMessage(copy.unsupported); }
      }
    })();
    return () => { active = false; };
  }, [copy.compatible, copy.unsupported]);

  useEffect(() => {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
  }, [installed]);

  const selected = useMemo(() => models.find(model => model.model_id === selectedId) || null, [models, selectedId]);
  const filtered = useMemo(() => models.filter(model => model.model_id.toLowerCase().includes(query.toLowerCase())), [models, query]);

  useEffect(() => {
    if (!selected) return;
    const repo = getHuggingFaceRepo(selected);
    if (!repo || modelSizes[repo] !== undefined) return;
    let active = true;
    fetch('https://huggingface.co/api/models/' + repo + '?blobs=true')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!active || !data || !Array.isArray(data.siblings)) return;
        const total = data.siblings.reduce((sum: number, file: { size?: number; lfs?: { size?: number } }) => sum + (file.lfs?.size || file.size || 0), 0);
        setModelSizes(previous => ({ ...previous, [repo]: total > 0 ? total : null }));
      })
      .catch(() => { if (active) setModelSizes(previous => ({ ...previous, [repo]: null })); });
    return () => { active = false; };
  }, [selected, modelSizes]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadModel = useCallback(async (modelId: string, isDownload: boolean) => {
    if (busy || runtime !== 'ready') return;
    setBusy(true); setProgress(0); setProgressText(isDownload ? copy.downloading : copy.loading);
    try {
      const { CreateMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
      const engine = await CreateMLCEngine(modelId, {
        appConfig: { ...prebuiltAppConfig, cacheBackend: 'indexeddb' },
        initProgressCallback: (info: { progress?: number; text?: string }) => {
          setProgress(Math.max(0, Math.min(100, Math.round((info.progress || 0) * 100))));
          setProgressText(info.text || copy.loading);
        },
      });
      engineRef.current = engine;
      setInstalled(previous => previous.includes(modelId) ? previous : [...previous, modelId]);
      setSelectedId(modelId);
      setMessages([{ role: 'assistant', content: dari ? 'سلام! من مدل آفلاین AFG AI هستم. چطور کمک کنم؟' : 'Hello! I am your local AFG AI model. How can I help?' }]);
      if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorage({ usage: estimate.usage, quota: estimate.quota });
      }
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : copy.failed);
    } finally { setBusy(false); setProgress(0); setProgressText(''); }
  }, [busy, runtime, copy, dari]);

  const sendMessage = async () => {
    const text = prompt.trim();
    if (!text || !engineRef.current || chatBusy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setPrompt(''); setChatBusy(true);
    try {
      const result = await engineRef.current.chat.completions.create({
        messages: next.map(item => ({ role: item.role, content: item.content })),
        temperature: 0.7,
      });
      const answer = result.choices?.[0]?.message?.content;
      setMessages(previous => [...previous, { role: 'assistant', content: typeof answer === 'string' ? answer : JSON.stringify(answer || '') }]);
    } catch (error) {
      setMessages(previous => [...previous, { role: 'assistant', content: error instanceof Error ? error.message : copy.failed }]);
    } finally { setChatBusy(false); }
  };

  const forgetModel = async (modelId: string) => {
    if (engineRef.current && selectedId === modelId) {
      try { await engineRef.current.unload(); } catch { /* cache remains intact */ }
      engineRef.current = null;
      setMessages([]);
    }
    setInstalled(previous => previous.filter(id => id !== modelId));
  };

  const selectedRepo = selected ? getHuggingFaceRepo(selected) : null;
  const exactSize = selectedRepo ? modelSizes[selectedRepo] : undefined;

  return <section className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" dir={dari ? 'rtl' : 'ltr'}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-600"><WifiOff size={14}/>{dari ? 'بدون وابستگی به سرور' : 'Server-independent'}</div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm opacity-70">{copy.subtitle}</p></div>
      <div className="rounded-2xl border p-3 text-end"><div className="flex items-center gap-2 text-xs opacity-70"><HardDrive size={15}/>{copy.storage}</div><div className="mt-1 text-sm font-bold">{formatBytes(storage.usage)} / {formatBytes(storage.quota)}</div></div>
    </header>

    <div className={'rounded-2xl border p-4 ' + (runtime === 'ready' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
      <div className="flex items-start gap-3"><Cpu size={20} className="mt-0.5 shrink-0"/><div className="min-w-0"><div className="font-semibold">{copy.runtime}</div><p className="mt-1 text-sm opacity-75">{runtime === 'checking' ? copy.checking : runtimeMessage}</p></div></div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.9fr)]">
      <section className="min-w-0 space-y-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{copy.catalog}</h2><span className="text-xs opacity-60">{models.length} {dari ? 'مدل' : 'models'}</span></div>
        <label className="flex items-center gap-2 rounded-xl border px-3"><Search size={17} className="opacity-50"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></label>
        <div className="max-h-[430px] space-y-2 overflow-y-auto pe-1">
          {filtered.map(model => {
            const active = selectedId === model.model_id;
            const repo = getHuggingFaceRepo(model);
            const size = repo ? modelSizes[repo] : undefined;
            const isInstalled = installed.includes(model.model_id);
            return <button key={model.model_id} type="button" onClick={() => setSelectedId(model.model_id)} className={'w-full rounded-xl border p-3 text-start transition ' + (active ? 'border-cyan-400 bg-cyan-400/10' : 'hover:border-cyan-400/50')}>
              <div className="flex items-start justify-between gap-2"><span className="break-all text-sm font-semibold">{model.model_id}</span>{isInstalled && <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">{copy.installed}</span>}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-65"><span>{copy.minMemory}: {formatBytes((model.vram_required_MB || 0) * 1024 * 1024)}</span><span>{copy.downloadSize}: {size === undefined ? '…' : formatBytes(size)}</span></div>
            </button>;
          })}
          {!filtered.length && <p className="p-5 text-center text-sm opacity-60">{copy.noModels}</p>}
        </div>
        {selected && <div className="space-y-3 rounded-xl bg-slate-500/5 p-3">
          <div className="flex items-center gap-2 text-xs opacity-65"><ShieldCheck size={15}/>{copy.source}</div>
          <p className="text-xs opacity-65">{copy.limitation}</p>
          <p className="text-xs opacity-65">{copy.onlineNeeded}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{copy.downloadSize}</span><strong>{exactSize ? formatBytes(exactSize) : copy.unknownSize}</strong></div>
          <button type="button" disabled={runtime !== 'ready' || busy} onClick={() => void loadModel(selected.model_id, !installed.includes(selected.model_id))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><ArrowDownToLine size={17}/>{installed.includes(selected.model_id) ? copy.load : copy.install}</button>
        </div>}
        {busy && <div className="space-y-2 rounded-xl border p-3"><div className="flex justify-between gap-2 text-xs"><span className="truncate">{progressText}</span><strong>{progress}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: progress + '%' }}/></div></div>}
      </section>

      <section className="flex min-h-[480px] min-w-0 flex-col rounded-2xl border p-4">
        <div className="flex items-center gap-2"><MessageSquare size={18}/><div><h2 className="font-bold">{copy.chat}</h2><p className="text-xs opacity-60">{copy.chatHint}</p></div></div>
        <div className="my-3 rounded-xl bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">{copy.privacy}</div>
        {!engineRef.current && <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center"><Sparkles size={34} className="opacity-40"/><p className="text-sm opacity-60">{copy.choose}</p></div>}
        {engineRef.current && <div className="flex-1 space-y-3 overflow-y-auto py-3">{messages.map((message,index)=><div key={index} className={'max-w-[92%] whitespace-pre-wrap rounded-2xl p-3 text-sm leading-6 ' + (message.role === 'user' ? 'ms-auto bg-cyan-500/10' : 'me-auto bg-slate-500/10')}>{message.content}</div>)}{chatBusy && <div className="text-xs opacity-60">{dari ? 'در حال تولید پاسخ محلی…' : 'Generating locally…'}</div>}<div ref={chatEndRef}/></div>}
        <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void sendMessage(); }}>
          <input value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={copy.input} disabled={!engineRef.current || chatBusy} className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-3 text-sm outline-none disabled:opacity-40"/>
          <button type="submit" disabled={!engineRef.current || !prompt.trim() || chatBusy} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{copy.send}</button>
        </form>
        <div className="mt-3 border-t pt-3"><div className="mb-2 text-xs font-semibold opacity-70">{copy.installed}</div>
          {installed.length === 0 ? <p className="text-xs opacity-55">{copy.noInstalled}</p> : installed.map(id=><div key={id} className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="min-w-0 break-all">{id}</span><button type="button" onClick={() => void forgetModel(id)} aria-label={copy.remove} title={copy.remove} className="shrink-0 rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 size={15}/></button></div>)}
        </div>
      </section>
    </div>
  </section>;
}
