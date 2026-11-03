import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Cpu, HardDrive, LoaderCircle, MessageSquare, Search, ShieldCheck, Sparkles, WifiOff } from 'lucide-react';
import type { Language } from '../../types/afg';
import { searchHuggingFaceGGUF, getHuggingFaceRepository, formatModelCategory, type HuggingFaceModel, type HuggingFaceRepository } from '../../lib/huggingFaceOfflineCatalog';
import { assessOfflineModelFit, scanOfflineDevice, type OfflineDeviceProfile, type ModelFit } from '../../lib/offlineDevice';
import { downloadGGUF, listOfflineDownloads, pauseGGUFDownload, removeOfflineModel, resumeOfflineDownload, usesNativeOfflineDownloads, type OfflineDownloadState } from '../../lib/offlineModelDownloads';
import { clearOfflineChatMessages, loadOfflineChatMessages, saveOfflineChatMessages, type OfflineChatMessage } from '../../lib/offlineChatStorage';
import { generateNativeLlamaResponse, getNativeLlamaRuntimeInfo, loadNativeLlamaModel, unloadNativeLlamaModel, streamNativeLlamaResponse } from '../../lib/offlineLlamaRuntime';
import { downloadOfflineDiagnosticReport, recordOfflineDiagnostic } from '../../lib/offlineDiagnostics';
import { downloadOfflineMetricsReport, recordOfflineMetric } from '../../lib/offlineMetrics';

type CatalogModel = {
  model_id: string;
  vram_required_MB?: number;
  low_resource_required?: boolean;
  model?: unknown;
};
type ChatMessage = OfflineChatMessage;
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

export function AfgOfflineHubView({ language, initialView = 'chat' }: { language: Language; initialView?: 'models' | 'chat' }) {
  const dari = language === 'dari';
  const [viewMode, setViewMode] = useState<'models' | 'chat'>(initialView);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [hfModels, setHfModels] = useState<HuggingFaceModel[]>([]);
  const [hfFormat, setHfFormat] = useState<'gguf' | 'all'>('gguf');
  const [sparkModels, setSparkModels] = useState<HuggingFaceModel[]>([]);
  const [hfRecommended, setHfRecommended] = useState<Array<{ model: HuggingFaceModel; filePath: string; fileSize: number; fit: 'recommended' | 'limited' }>>([]);
  const [hfCategories, setHfCategories] = useState<string[]>([]);
  const [hfPage, setHfPage] = useState(0);
  const [hfHasMore, setHfHasMore] = useState(false);
  const [hfBusy, setHfBusy] = useState(false);
  const [hfError, setHfError] = useState('');
  const [hfRetry, setHfRetry] = useState(0);
  const [hfSelected, setHfSelected] = useState('');
  const [hfRepository, setHfRepository] = useState<HuggingFaceRepository | null>(null);
  const [hfQuantization, setHfQuantization] = useState('');
  const pendingGgufPathRef = useRef('');
  const [ggufTasks, setGgufTasks] = useState<OfflineDownloadState[]>([]);
  const [ggufProgress, setGgufProgress] = useState<Record<string, { downloadedBytes: number; totalBytes: number | null; percent: number | null; status: string }>>({});
  const [ggufBusyId, setGgufBusyId] = useState('');
  const selectedHfModel = useMemo(() => [...hfModels, ...sparkModels].find(model => model.id === hfSelected) || null, [hfModels, sparkModels, hfSelected]);
  const [device, setDevice] = useState<OfflineDeviceProfile | null>(null);
  const [deviceScanBusy, setDeviceScanBusy] = useState(true);
  const [modelFilter, setModelFilter] = useState<'all' | ModelFit>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [runtime, setRuntime] = useState<RuntimeState>('checking');
  const [webGpuAvailable, setWebGpuAvailable] = useState(false);
  const [nativeRuntimeAvailable, setNativeRuntimeAvailable] = useState(false);
  const [activeOfflineModelLabel, setActiveOfflineModelLabel] = useState('');
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
  const [messagesModelId, setMessagesModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [thermalWarning, setThermalWarning] = useState(false);
  const engineRef = useRef<any>(null);
  const engineModelIdRef = useRef('');
  const nativeEngineRef = useRef(false);
  const nativeAbortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { nativeAbortRef.current?.abort(); const engine = engineRef.current; engineRef.current = null; engineModelIdRef.current = ''; nativeEngineRef.current = false; if (engine) void engine.unload().catch(() => undefined); }, []);

  const copy = dari ? {
    title: 'مرکز هوش مصنوعی آفلاین', subtitle: 'مدل را یک‌بار دانلود کن و در همین دستگاه، بدون اینترنت از آن استفاده کن.',
    runtime: 'وضعیت موتور محلی', compatible: 'این دستگاه از WebGPU پشتیبانی می‌کند.', unsupported: 'این مرورگر یا WebView از WebGPU پشتیبانی نمی‌کند؛ اجرای مدل آفلاین در این دستگاه فعلاً فعال نیست.',
    checking: 'در حال بررسی سخت‌افزار…', catalog: 'مدل‌های سازگار', search: 'جست‌وجوی مدل…', install: 'دانلود و نصب', installed: 'ذخیره‌شده در دستگاه', downloading: 'در حال دانلود مدل…',
    minMemory: 'حداقل حافظه گرافیکی', downloadSize: 'حجم تقریبی مخزن مدل', unknownSize: 'اندازه دقیق در دسترس نیست', storage: 'فضای ذخیره‌سازی دستگاه',
    chat: 'گفت‌وگوی آفلاین', chatHint: 'مدل نصب‌شده را بارگذاری کن و بدون اتصال به سرور پیام بده.', choose: 'یک مدل انتخاب کن', load: 'بارگذاری مدل', send: 'ارسال', input: 'پیام خود را بنویس…',
    noModels: 'مدل سازگاری پیدا نشد.', noInstalled: 'هنوز مدلی نصب نشده است.', noOfflineModel: 'هیچ مدل آفلاینی نصب نیست. لطفاً از بخش مدل‌ها یک مدل دانلود کن.', ggufRuntimeUnavailable: 'فایل GGUF ذخیره شده، اما موتور اجرای آن در این نسخه آماده نیست.', loadGgufHint: 'از بخش مدل‌ها روی Load model بزن تا مدل محلی اجرا شود.', loading: 'در حال بارگذاری مدل…', ready: 'مدل آماده است؛ پیام‌ها فقط روی همین دستگاه پردازش می‌شوند.',
    failed: 'عملیات انجام نشد. فضای خالی و سازگاری دستگاه را بررسی کن.', remove: 'فراموش‌کردن مدل', privacy: 'حریم خصوصی: متن گفتگو به سرور AFG AI ارسال نمی‌شود.',
    source: 'منبع مدل: MLC / WebLLM', limitation: 'این فهرست، مدل‌های از پیش تبدیل‌شده و سازگار با WebLLM را نشان می‌دهد؛ همه فایل‌های GGUF یا همه مدل‌های Hugging Face قابل اجرا نیستند.',
    onlineNeeded: 'برای دانلود اولیه به اینترنت نیاز است. پس از ذخیره موفق، اجرای مدل می‌تواند آفلاین باشد.',
    deviceTitle: 'اسکن هوشمند دستگاه', deviceUnknown: 'در حال بررسی مشخصات…', deviceRam: 'حافظه RAM کل', deviceAvailableRam: 'RAM آزاد فعلی', deviceCpu: 'هسته‌های پردازنده', deviceGpu: 'پردازنده گرافیکی', deviceStorage: 'فضای قابل استفاده', devicePlatform: 'سیستم و دستگاه', recommended: 'پیشنهادشده', limited: 'با محدودیت', incompatible: 'ناسازگار', allModels: 'همه', privacyScan: 'اسکن فقط مشخصات سخت‌افزاری و قابلیت‌های مرورگر را بررسی می‌کند.', rescan: 'اسکن دوباره',
  } : {
    title: 'Offline AI Hub', subtitle: 'Download a model once, then use it on this device without an internet connection.',
    runtime: 'Local runtime status', compatible: 'This device supports WebGPU.', unsupported: 'This browser or WebView does not support WebGPU. Offline model inference is unavailable on this device for now.',
    checking: 'Checking device capabilities…', catalog: 'Compatible models', search: 'Search models…', install: 'Download & install', installed: 'Installed locally', downloading: 'Downloading model…',
    minMemory: 'Minimum GPU memory', downloadSize: 'Approx. repository size', unknownSize: 'Exact size unavailable', storage: 'Device storage',
    chat: 'Offline chat', chatHint: 'Load an installed model and chat without sending requests to a server.', choose: 'Choose a model', load: 'Load model', send: 'Send', input: 'Write a message…',
    noModels: 'No compatible models found.', noInstalled: 'No models installed yet.', noOfflineModel: 'No offline model installed. Please download a model from the Models section.', ggufRuntimeUnavailable: 'The GGUF file is stored locally, but its inference runtime is not available in this build.', loadGgufHint: 'Open Models and tap Load model to start the local GGUF runtime.', loading: 'Loading model…', ready: 'Model ready. Messages are processed on this device only.',
    failed: 'Operation failed. Check free storage and device compatibility.', remove: 'Forget model', privacy: 'Privacy: chat text is not sent to AFG AI servers.',
    source: 'Model source: MLC / WebLLM', limitation: 'This catalog lists pre-converted models compatible with WebLLM. Not every GGUF file or every Hugging Face model can run here.',
    onlineNeeded: 'An internet connection is required for the first download. Once cached, the model can run offline.',
    deviceTitle: 'Smart device scan', deviceUnknown: 'Checking device details…', deviceRam: 'Total RAM', deviceAvailableRam: 'Available RAM', deviceCpu: 'CPU cores', deviceGpu: 'Graphics processor', deviceStorage: 'Available storage', devicePlatform: 'Platform & device', recommended: 'Recommended', limited: 'Limited', incompatible: 'Incompatible', allModels: 'All', privacyScan: 'The scan checks hardware capabilities and browser-provided information only.', rescan: 'Rescan device',
  };

  useEffect(() => {
    let active = true;
    setDeviceScanBusy(true);
    void scanOfflineDevice().then(result => { if (active) setDevice(result); }).catch(() => {}).finally(() => { if (active) setDeviceScanBusy(false); });
    void (async () => {
      let nativeAvailable = false;
      try {
        const nativeInfo = await getNativeLlamaRuntimeInfo();
        nativeAvailable = nativeInfo.available;
        if (active) setNativeRuntimeAvailable(nativeAvailable);
      } catch { if (active) setNativeRuntimeAvailable(false); }
      if (!active) return;
      const nativeMessage = dari ? 'موتور بومی llama.cpp آماده است؛ مدل‌های GGUF روی همین دستگاه اجرا می‌شوند.' : 'Native llama.cpp CPU runtime is ready for local GGUF inference.';
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      if (!gpu) {
        setWebGpuAvailable(false);
        setRuntime(nativeAvailable ? 'ready' : 'unsupported');
        setRuntimeMessage(nativeAvailable ? nativeMessage : copy.unsupported);
        if (navigator.storage?.estimate) { const estimate = await navigator.storage.estimate(); if (active) setStorage({ usage: estimate.usage, quota: estimate.quota }); }
        return;
      }
      try {
        const adapter = await gpu.requestAdapter();
        if (!active) return;
        if (!adapter) {
          setWebGpuAvailable(false);
          setRuntime(nativeAvailable ? 'ready' : 'unsupported');
          setRuntimeMessage(nativeAvailable ? nativeMessage : copy.unsupported);
          return;
        }
        const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
        if (!active) return;
        const catalog = (prebuiltAppConfig.model_list || []) as CatalogModel[];
        setModels(catalog);
        if (!selectedId) setSelectedId(catalog[0]?.model_id || '');
        setWebGpuAvailable(true);
        setRuntime('ready');
        setRuntimeMessage(nativeAvailable ? nativeMessage + ' WebGPU is also available.' : copy.compatible);
      } catch {
        setWebGpuAvailable(false);
        setRuntime(nativeAvailable ? 'ready' : 'error');
        setRuntimeMessage(nativeAvailable ? nativeMessage : copy.unsupported);
      }
      if (navigator.storage?.estimate) { const estimate = await navigator.storage.estimate(); if (active) setStorage({ usage: estimate.usage, quota: estimate.quota }); }
    })();
    return () => { active = false; };
  }, [copy.compatible, copy.unsupported, dari]);

  useEffect(() => {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
  }, [installed]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); setMessagesModelId(''); return; }
    let active = true;
    setMessagesModelId('');
    setMessages([]);
    void loadOfflineChatMessages(selectedId).then(history => { if (active) { setMessages(history); setMessagesModelId(selectedId); } }).catch(() => { if (active) setMessagesModelId(selectedId); });
    if (engineRef.current && engineModelIdRef.current !== selectedId) { const engine = engineRef.current; engineRef.current = null; engineModelIdRef.current = ''; nativeEngineRef.current = false; setActiveOfflineModelLabel(''); void engine.unload().catch(() => undefined); }
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (selectedId && messagesModelId === selectedId && messages.length) void saveOfflineChatMessages(selectedId, messages).catch(() => undefined);
  }, [selectedId, messagesModelId, messages]);


  useEffect(() => {
    if (!models.length || !installed.length) return;
    let active = true;
    void import('@mlc-ai/web-llm').then(async ({ hasModelInCache, prebuiltAppConfig }) => {
      const appConfig = { ...prebuiltAppConfig, cacheBackend: 'indexeddb' as const };
      const checks = await Promise.all(installed.map(async id => [id, await hasModelInCache(id, appConfig)] as const));
      if (active) setInstalled(previous => previous.filter(id => checks.some(([checkedId, cached]) => checkedId === id && cached)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [models, installed.length]);


  useEffect(() => {
    let active = true;
    void listOfflineDownloads().then(tasks => {
      if (!active) return;
      setGgufTasks(tasks);
      if (usesNativeOfflineDownloads()) {
        const running = tasks.find(task => task.status === 'downloading');
        if (running) {
          setGgufBusyId(running.id);
          void resumeOfflineDownload(running.id, progress => {
            if (active) setGgufProgress(previous => ({ ...previous, [running.id]: progress }));
          }).catch(error => {
            if (active) setHfError(error instanceof Error ? error.message : 'Could not reconnect to the background download.');
          }).finally(() => {
            if (active) {
              setGgufBusyId('');
              void listOfflineDownloads().then(setGgufTasks).catch(() => undefined);
            }
          });
        }
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void searchHuggingFaceGGUF({ query: 'Spark-X2.6-1.7B-GGUF', page: 0, sort: 'downloads', direction: 'desc', signal: controller.signal })
      .then(result => result.items.length ? result : searchHuggingFaceGGUF({ query: 'Spark-X2.6', page: 0, sort: 'downloads', direction: 'desc', signal: controller.signal }))
      .then(result => setSparkModels(result.items))
      .catch(() => { if (!controller.signal.aborted) setSparkModels([]); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!device || !hfModels.length) { setHfRecommended([]); return; }
    let active = true;
    const candidates = hfModels.slice(0, 5);
    void Promise.all(candidates.map(async model => {
      try {
        const repository = await getHuggingFaceRepository(model.id, undefined, model.sha || 'main');
        const file = repository.ggufFiles.find(item => item.quantization === 'Q4_K_M') || repository.ggufFiles[0];
        if (!file?.size) return null;
        const requiredRam = file.size / (1024 ** 3) * 1.35 + 0.8;
        const memoryBudget = device.memoryGiB ? device.memoryGiB * 0.8 : null;
        const storageBudget = device.storageFreeBytes;
        if ((memoryBudget !== null && requiredRam > memoryBudget) || (storageBudget !== null && file.size > storageBudget)) return null;
        return { model, filePath: file.path, fileSize: file.size, fit: device.memoryGiB && requiredRam <= device.memoryGiB * 0.65 ? 'recommended' as const : 'limited' as const };
      } catch { return null; }
    })).then(results => { if (active) setHfRecommended(results.filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 3)); });
    return () => { active = false; };
  }, [hfModels, device]);
  useEffect(() => {
    const controller = new AbortController();
    setHfBusy(true);
    setHfError('');
    const timer = window.setTimeout(() => {
      void searchHuggingFaceGGUF({ query, format: hfFormat, page: 0, sort: 'downloads', direction: 'desc', signal: controller.signal })
        .then(result => { setHfModels(result.items); setHfPage(0); setHfHasMore(result.hasMore); })
        .catch(error => { if (!controller.signal.aborted) { setHfError(error instanceof Error ? error.message : 'Catalog unavailable'); void recordOfflineDiagnostic({ code: 'catalog_error' }).catch(() => undefined); } })
        .finally(() => { if (!controller.signal.aborted) setHfBusy(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, hfFormat, hfRetry]);

  useEffect(() => {
    if (!hfSelected) { setHfRepository(null); setHfQuantization(''); return; }
    const controller = new AbortController(); setHfRepository(null);
    void getHuggingFaceRepository(hfSelected, controller.signal, selectedHfModel?.sha || 'main')
      .then(repository => { setHfRepository(repository); setHfQuantization(pendingGgufPathRef.current || repository.ggufFiles[0]?.path || ''); pendingGgufPathRef.current = ''; })
      .catch(error => { if (!controller.signal.aborted) { setHfError(error instanceof Error ? error.message : 'Repository metadata unavailable'); void recordOfflineDiagnostic({ code: 'catalog_error', modelId: hfSelected }).catch(() => undefined); } });
    return () => controller.abort();
  }, [hfSelected, selectedHfModel?.sha]);

  const downloadSelectedGguf = async () => {
    if (!hfRepository || !hfQuantization || ggufBusyId) return;
    const file = hfRepository.ggufFiles.find(item => item.path === hfQuantization);
    if (!file) return;
    const id = hfSelected + '/' + file.path;
    setGgufBusyId(id);
    const startedAt = Date.now();
    void recordOfflineMetric({ name: 'download_started', modelId: hfSelected, bytes: file.size }).catch(() => undefined);
    try {
      const downloaded = await downloadGGUF({ repoId: hfSelected, fileName: file.path, revision: hfRepository.revision, expectedBytes: file.size, expectedSha256: file.sha256, onProgress: progress => setGgufProgress(previous => ({ ...previous, [id]: progress })) });
      void recordOfflineMetric({ name: 'download_completed', modelId: hfSelected, bytes: downloaded.downloadedBytes, durationMs: Date.now() - startedAt }).catch(() => undefined);
      setGgufTasks(await listOfflineDownloads());
    } catch (error) {
      const intentionallyPaused = error instanceof DOMException && error.name === 'AbortError';
      if (!intentionallyPaused) {
        const checksumFailure = error instanceof Error && /sha-?256|checksum|integrity/i.test(error.message);
        void recordOfflineMetric({ name: checksumFailure ? 'checksum_failed' : 'download_failed', modelId: hfSelected, durationMs: Date.now() - startedAt }).catch(() => undefined);
        void recordOfflineDiagnostic({ code: checksumFailure ? 'checksum_error' : 'download_error', modelId: hfSelected }).catch(() => undefined);
        setHfError(error instanceof Error ? error.message : 'GGUF download failed.');
      }
    } finally { setGgufBusyId(''); setGgufTasks(await listOfflineDownloads().catch(() => [])); }
  };
  const resumeGguf = async (task: OfflineDownloadState) => {
    setGgufBusyId(task.id);
    setHfError('');
    try {
      await resumeOfflineDownload(task.id, progress => setGgufProgress(previous => ({ ...previous, [task.id]: progress })));
      setGgufTasks(await listOfflineDownloads());
    } catch (error) {
      const intentionallyPaused = error instanceof DOMException && error.name === 'AbortError';
      if (!intentionallyPaused) setHfError(error instanceof Error ? error.message : 'Resume failed.');
    } finally {
      setGgufBusyId('');
      setGgufTasks(await listOfflineDownloads().catch(() => []));
    }
  };
  const removeGguf = async (id: string) => {
    if (selectedId === id && engineRef.current) { const engine = engineRef.current; engineRef.current = null; engineModelIdRef.current = ''; nativeEngineRef.current = false; setActiveOfflineModelLabel(''); await engine.unload().catch(() => undefined); }
    await removeOfflineModel(id);
    setGgufTasks(await listOfflineDownloads());
  };
  const pauseSelectedGguf = async (id: string) => {
    try { await pauseGGUFDownload(id); setGgufTasks(await listOfflineDownloads()); }
    catch (error) { setHfError(error instanceof Error ? error.message : 'Pause failed.'); }
  };
  const loadMoreHf = async () => {
    if (hfBusy || !hfHasMore) return;
    setHfBusy(true); setHfError('');
    try { const nextPage = hfPage + 1; const result = await searchHuggingFaceGGUF({ query, format: hfFormat, page: nextPage });
      setHfModels(previous => [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))]);
      setHfPage(nextPage); setHfHasMore(result.hasMore);
    } catch (error) { void recordOfflineDiagnostic({ code: 'catalog_error' }).catch(() => undefined); setHfError(error instanceof Error ? error.message : 'Catalog unavailable'); } finally { setHfBusy(false); }
  };
  const selected = useMemo(() => models.find(model => model.model_id === selectedId) || null, [models, selectedId]);
  const recommendedModels = useMemo(() => device ? models.filter(model => assessOfflineModelFit(model.vram_required_MB || 0, device) === 'recommended').slice(0, 5) : [], [models, device]);
  const filtered = useMemo(() => models.filter(model => {
    if (!model.model_id.toLowerCase().includes(query.toLowerCase())) return false;
    if (!device || modelFilter === 'all') return true;
    return assessOfflineModelFit(model.vram_required_MB || 0, device) === modelFilter;
  }), [models, query, device, modelFilter]);

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
    if (busy || runtime !== 'ready' || !webGpuAvailable) return;
    const target = models.find(item => item.model_id === modelId);
    const fit = target && device ? assessOfflineModelFit(target.vram_required_MB || 0, device) : 'limited';
    const targetRepo = target ? getHuggingFaceRepo(target) : null;
    const estimatedDownloadBytes = targetRepo ? modelSizes[targetRepo] : null;
    const availableStorage = typeof storage.quota === 'number' ? Math.max(0, storage.quota - (storage.usage || 0)) : null;
    if (isDownload && estimatedDownloadBytes && availableStorage !== null && estimatedDownloadBytes > availableStorage * 0.85) {
      setRuntimeMessage(dari ? 'فضای ذخیره‌سازی کافی نیست؛ فضای خالی بیشتری ایجاد کن.' : 'Not enough estimated browser storage. Free up space before downloading.'); return;
    }
    if (fit === 'incompatible') { setRuntimeMessage(dari ? 'این مدل با قابلیت‌های شناسایی‌شده دستگاه سازگار نیست.' : 'This model is incompatible with the detected device capabilities.'); return; }
    setBusy(true); setProgress(0); setProgressText(isDownload ? copy.downloading : copy.loading);
    const modelOperationStartedAt = Date.now();
    if (isDownload) void recordOfflineMetric({ name: 'download_started', modelId }).catch(() => undefined);
    try {
      if (engineRef.current) {
        try { await engineRef.current.unload(); } catch { /* continue with a fresh engine */ }
        engineRef.current = null;
        engineModelIdRef.current = '';
      }
      const { CreateMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
      const engine = await CreateMLCEngine(modelId, {
        appConfig: { ...prebuiltAppConfig, cacheBackend: 'indexeddb' },
        initProgressCallback: (info: { progress?: number; text?: string }) => {
          setProgress(Math.max(0, Math.min(100, Math.round((info.progress || 0) * 100))));
          setProgressText(info.text || copy.loading);
        },
      });
      engineRef.current = engine;
      nativeEngineRef.current = false;
      if (isDownload) void recordOfflineMetric({ name: 'download_completed', modelId, durationMs: Date.now() - modelOperationStartedAt }).catch(() => undefined);
      engineModelIdRef.current = modelId;
      setActiveOfflineModelLabel(modelId);
      setInstalled(previous => previous.includes(modelId) ? previous : [...previous, modelId]);
      setSelectedId(modelId);
      if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorage({ usage: estimate.usage, quota: estimate.quota });
      }
    } catch (error) {
      const outOfMemory = /out of memory|allocation failed|cannot allocate/i.test(error instanceof Error ? error.message : '');
      if (outOfMemory) void recordOfflineMetric({ name: 'out_of_memory', modelId, durationMs: Date.now() - modelOperationStartedAt }).catch(() => undefined);
      else if (isDownload) void recordOfflineMetric({ name: 'download_failed', modelId, durationMs: Date.now() - modelOperationStartedAt }).catch(() => undefined);
      void recordOfflineDiagnostic({ code: outOfMemory ? 'out_of_memory' : isDownload ? 'download_error' : 'model_load_error', modelId }).catch(() => undefined);
      setRuntimeMessage(error instanceof Error ? error.message : copy.failed);
    } finally { setBusy(false); setProgress(0); setProgressText(''); }
  }, [busy, runtime, webGpuAvailable, copy, dari, models, device, modelSizes, storage]);

  const loadNativeGgufModel = async (task: OfflineDownloadState) => {
    if (!nativeRuntimeAvailable || !task.localPath || busy || task.status !== 'installed') return;
    setBusy(true); setProgressText(dari ? 'در حال بارگذاری مدل GGUF…' : 'Loading local GGUF model…');
    try {
      if (engineRef.current) {
        const previous = engineRef.current;
        engineRef.current = null;
        engineModelIdRef.current = '';
        nativeEngineRef.current = false;
        await previous.unload().catch(() => undefined);
      }
      const freshDevice = await scanOfflineDevice();
      setDevice(freshDevice);
      const modelBytes = task.expectedBytes || task.downloadedBytes;
      const estimatedRequiredRamGiB = modelBytes > 0 ? (modelBytes / (1024 ** 3)) * 1.35 + (lowPowerMode ? 0.5 : 0.8) : null;
      if (!freshDevice.nativeInfoAvailable || freshDevice.availableMemoryGiB === null || freshDevice.lowMemory === true) {
        throw new Error(dari ? 'حافظه آزاد فعلی دستگاه قابل تأیید نیست یا سیستم در حالت کمبود حافظه است. برنامه‌های دیگر را ببند و دوباره اسکن کن.' : 'Current free RAM could not be verified, or Android reports low-memory state. Close other apps and rescan before loading.');
      }
      if (estimatedRequiredRamGiB !== null && estimatedRequiredRamGiB > freshDevice.availableMemoryGiB * 0.8) {
        throw new Error(dari ? 'حافظه آزاد فعلی برای بارگذاری این مدل کافی نیست. یک مدل کوچک‌تر انتخاب کن.' : 'Current available RAM is insufficient for this model. Choose a smaller quantization or model.');
      }
      if (estimatedRequiredRamGiB !== null && freshDevice.memoryGiB !== null && estimatedRequiredRamGiB > freshDevice.memoryGiB * 0.8) {
        throw new Error(dari ? 'نیاز تخمینی RAM مدل از ظرفیت امن دستگاه بیشتر است.' : 'Estimated model RAM exceeds the device safe memory budget.');
      }
      setSelectedId(task.id);
      const contextSize = lowPowerMode ? 1024 : 2048;
      const threads = Math.max(1, Math.min(4, freshDevice.cpuCores || 4));
      await loadNativeLlamaModel(task.localPath, contextSize, threads);
      nativeEngineRef.current = true;
      engineRef.current = {
        chat: { completions: { create: async (request: { messages: Array<{ role: string; content: string }>; max_tokens?: number }) => ({ choices: [{ message: { content: await generateNativeLlamaResponse(request.messages, request.max_tokens || 256) } }] }) } },
        unload: async () => unloadNativeLlamaModel(),
      };
      engineModelIdRef.current = task.id;
      setActiveOfflineModelLabel(task.repoId + '/' + task.fileName);
      setRuntime('ready');
      setRuntimeMessage(dari ? 'مدل GGUF به‌صورت محلی آماده است.' : 'GGUF model loaded locally and ready for offline chat.');
      setViewMode('chat');
    } catch (error) {
      const outOfMemory = /out of memory|allocation failed|cannot allocate|memory/i.test(error instanceof Error ? error.message : '');
      void recordOfflineDiagnostic({ code: outOfMemory ? 'out_of_memory' : 'model_load_error', modelId: task.repoId }).catch(() => undefined);
      if (outOfMemory) void recordOfflineMetric({ name: 'out_of_memory', modelId: task.repoId }).catch(() => undefined);
      setRuntimeMessage(error instanceof Error ? error.message : copy.failed);
    }
    finally { setBusy(false); setProgressText(''); }
  };
  const clearCurrentOfflineChat = async () => {
    setMessages([]);
    await clearOfflineChatMessages(selectedId).catch(() => undefined);
  };
  const removeMlcModel = async (modelId: string) => {
    try {
      if (selectedId === modelId && engineRef.current) { await engineRef.current.unload(); engineRef.current = null; engineModelIdRef.current = ''; nativeEngineRef.current = false; setActiveOfflineModelLabel(''); setMessages([]); }
      const { deleteModelAllInfoInCache, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
      await deleteModelAllInfoInCache(modelId, { ...prebuiltAppConfig, cacheBackend: 'indexeddb' });
      setInstalled(previous => previous.filter(id => id !== modelId));
    } catch (error) { setRuntimeMessage(error instanceof Error ? error.message : copy.failed); }
  };
  const sendMessage = async () => {
    const text = prompt.trim();
    if (!text || !engineRef.current || chatBusy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setPrompt(''); setChatBusy(true); setThermalWarning(false);
    const thermalTimer = window.setTimeout(() => setThermalWarning(true), 120000);
    const inferenceStartedAt = Date.now();
    let streamedAnswer = '';
    if (!nativeEngineRef.current) void recordOfflineMetric({ name: 'inference_started', modelId: selectedId || null }).catch(() => undefined);
    try {
      if (nativeEngineRef.current) {
        const controller = new AbortController();
        nativeAbortRef.current = controller;
        setMessages([...next, { role: 'assistant', content: '' }]);
        const result = await streamNativeLlamaResponse(next, lowPowerMode ? 256 : 512, token => {
          streamedAnswer += token;
          setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, content: streamedAnswer } : message));
        }, controller.signal);
        if (result.cancelled) return;
        if (!streamedAnswer) streamedAnswer = result.text;
        setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, content: streamedAnswer } : message));
      } else {
        const result = await engineRef.current.chat.completions.create({
          messages: next.map(item => ({ role: item.role, content: item.content })),
          temperature: 0.7,
          max_tokens: lowPowerMode ? 256 : 512,
        });
        const answer = result.choices?.[0]?.message?.content;
        streamedAnswer = typeof answer === 'string' ? answer : JSON.stringify(answer || '');
        setMessages(previous => [...previous, { role: 'assistant', content: streamedAnswer }]);
        void recordOfflineMetric({ name: 'inference_completed', modelId: selectedId || null, durationMs: Date.now() - inferenceStartedAt }).catch(() => undefined);
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      if (!cancelled) {
        const outOfMemory = /out of memory|allocation failed|cannot allocate/i.test(error instanceof Error ? error.message : '');
        void recordOfflineMetric({ name: outOfMemory ? 'out_of_memory' : 'inference_failed', modelId: selectedId || null, durationMs: Date.now() - inferenceStartedAt }).catch(() => undefined);
        void recordOfflineDiagnostic({ code: outOfMemory ? 'out_of_memory' : 'inference_error', modelId: selectedId || null }).catch(() => undefined);
        setMessages(previous => [...previous, { role: 'assistant', content: error instanceof Error ? error.message : copy.failed }]);
      }
    } finally {
      nativeAbortRef.current = null;
      window.clearTimeout(thermalTimer);
      setChatBusy(false);
      setThermalWarning(false);
    }
  };

  const selectedFit = selected && device ? assessOfflineModelFit(selected.vram_required_MB || 0, device) : 'limited';
  const selectedRepo = selected ? getHuggingFaceRepo(selected) : null;
  const exactSize = selectedRepo ? modelSizes[selectedRepo] : undefined;
  const selectedGgufFile = hfRepository?.ggufFiles.find(file => file.path === hfQuantization) || null;
  const availableModelStorage = device?.storageFreeBytes ?? (typeof storage.quota === 'number' ? Math.max(0, storage.quota - (storage.usage || 0)) : null);
  const estimatedGgufRamGiB = selectedGgufFile?.size ? selectedGgufFile.size / (1024 ** 3) * 1.35 + 0.8 : null;
  const ggufStorageUnknown = availableModelStorage === null;
  const ggufStorageBlocked = Boolean(selectedGgufFile?.size && availableModelStorage !== null && selectedGgufFile.size > availableModelStorage);
  const ggufRamBlocked = Boolean(estimatedGgufRamGiB && device?.memoryGiB && estimatedGgufRamGiB > device.memoryGiB * 0.8);
  const ggufRamLimited = Boolean(estimatedGgufRamGiB && device?.availableMemoryGiB && estimatedGgufRamGiB > device.availableMemoryGiB * 0.8);
  const ggufGated = Boolean(selectedHfModel?.gated);
  const ggufRuntimeBlocked = usesNativeOfflineDownloads() && !nativeRuntimeAvailable;
  const ggufPreflightBlocked = !selectedGgufFile || !selectedGgufFile.size || ggufStorageUnknown || ggufStorageBlocked || ggufRamBlocked || ggufGated || ggufRuntimeBlocked;

  return <section className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" dir={dari ? 'rtl' : 'ltr'}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-600"><WifiOff size={14}/>{dari ? 'بدون وابستگی به سرور' : 'Server-independent'}</div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{viewMode === 'models' ? (dari ? 'مدل‌های آفلاین' : 'Offline Models') : copy.title}</h1><p className="mt-2 max-w-2xl text-sm opacity-70">{viewMode === 'models' ? (dari ? 'مدل‌ها را جست‌وجو، بررسی، دانلود و مدیریت کن.' : 'Discover, inspect, download and manage local AI models.') : copy.subtitle}</p></div>
      <div className="rounded-2xl border p-3 text-end"><div className="flex items-center gap-2 text-xs opacity-70"><HardDrive size={15}/>{copy.storage}</div><div className="mt-1 text-sm font-bold">{formatBytes(storage.usage)} / {formatBytes(storage.quota)}</div></div>
    </header>

    <nav className="flex gap-2 rounded-xl border p-1" aria-label={dari ? "بخش‌های آفلاین" : "Offline sections"}><button type="button" onClick={() => setViewMode("chat")} className={"flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold " + (viewMode === "chat" ? "bg-cyan-500 text-slate-950" : "opacity-65")}>{dari ? "گفت‌وگوی آفلاین" : "Offline Chat"}</button><button type="button" onClick={() => setViewMode("models")} className={"flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold " + (viewMode === "models" ? "bg-cyan-500 text-slate-950" : "opacity-65")}>{dari ? "مدیریت مدل‌ها" : "Models"}</button></nav>

    <section className="rounded-2xl border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{copy.deviceTitle}</h2><button type="button" onClick={() => { setDeviceScanBusy(true); void scanOfflineDevice().then(setDevice).finally(() => setDeviceScanBusy(false)); }} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{copy.rescan}</button></div>
      {deviceScanBusy || !device ? <p className="text-sm opacity-60">{copy.deviceUnknown}</p> : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[[copy.devicePlatform, device.deviceLabel + ' · ' + device.osLabel], [copy.deviceRam, device.memoryGiB ? device.memoryGiB + ' GB' : '—'], [copy.deviceAvailableRam, device.availableMemoryGiB ? device.availableMemoryGiB + ' GB' : '—'], [copy.deviceCpu, device.cpuCores ? String(device.cpuCores) : '—'], [copy.deviceGpu, device.gpuName || (device.gpuAvailable ? 'WebGPU' : 'Unavailable')], [copy.deviceStorage, device.storageFreeBytes ? formatBytes(device.storageFreeBytes) : '—']].map(([label,value]) => <div key={label} className="min-w-0 rounded-xl bg-slate-500/5 p-3"><div className="text-[11px] opacity-60">{label}</div><div className="mt-1 break-words text-xs font-semibold">{value}</div></div>)}
        </div>
        <p className="text-[11px] opacity-60">{copy.privacyScan} {device.browser} · {device.architecture} · {device.nativeInfoAvailable ? 'Native info' : 'Browser estimate'}</p>
        {device.lowMemory && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">{dari ? 'اندروید هشدار کمبود حافظه داده است؛ پیش از بارگذاری مدل برنامه‌های دیگر را ببند.' : 'Android reports low memory. Close other apps before loading a model.'}</p>}
        {device.notes.map(note => <p key={note} className="text-[11px] opacity-55">{note}</p>)}
      </>}
    </section>

    <div className={'rounded-2xl border p-4 ' + (runtime === 'ready' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
      <div className="flex items-start gap-3"><Cpu size={20} className="mt-0.5 shrink-0"/><div className="min-w-0"><div className="font-semibold">{copy.runtime}</div><p className="mt-1 text-sm opacity-75">{runtime === 'checking' ? copy.checking : runtimeMessage}</p></div></div>
    </div>

    {viewMode === "models" && <section className="min-w-0 space-y-3 rounded-2xl border p-4">
        {recommendedModels.length > 0 && <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="text-sm font-bold">{dari ? 'پیشنهاد برای دستگاه شما' : 'Recommended for your device'}</div><div className="flex gap-2 overflow-x-auto pb-1">{recommendedModels.map(model => <button key={model.model_id} type="button" onClick={() => setSelectedId(model.model_id)} className="min-w-44 rounded-lg border bg-slate-500/5 p-2 text-start"><div className="break-all text-xs font-semibold">{model.model_id}</div><div className="mt-1 text-[10px] text-emerald-600">{copy.recommended}</div></button>)}</div></div>}
        <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{copy.catalog}</h2><span className="text-xs opacity-60">{models.length} {dari ? 'مدل' : 'models'}</span></div>
        <label className="flex items-center gap-2 rounded-xl border px-3"><Search size={17} className="opacity-50"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></label>
        <div className="flex flex-wrap gap-1.5">{(['all','recommended','limited','incompatible'] as const).map(filter => <button key={filter} type="button" onClick={() => setModelFilter(filter)} className={'rounded-full border px-3 py-1.5 text-[11px] ' + (modelFilter === filter ? 'border-cyan-400 bg-cyan-400/10' : 'opacity-65')}>{filter === 'all' ? copy.allModels : copy[filter]}</button>)}</div>
        <div className="max-h-[430px] space-y-2 overflow-y-auto pe-1">
          {filtered.map(model => {
            const active = selectedId === model.model_id;
            const repo = getHuggingFaceRepo(model);
            const size = repo ? modelSizes[repo] : undefined;
            const isInstalled = installed.includes(model.model_id);
            const fit = device ? assessOfflineModelFit(model.vram_required_MB || 0, device) : 'limited';
            return <button key={model.model_id} type="button" onClick={() => setSelectedId(model.model_id)} className={'w-full rounded-xl border p-3 text-start transition ' + (active ? 'border-cyan-400 bg-cyan-400/10' : 'hover:border-cyan-400/50')}>
              <div className="flex items-start justify-between gap-2"><span className="break-all text-sm font-semibold">{model.model_id}</span>{isInstalled && <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">{copy.installed}</span>}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-65"><span>{copy.minMemory}: {formatBytes((model.vram_required_MB || 0) * 1024 * 1024)}</span><span>{copy.downloadSize}: {size === undefined ? '…' : size === null ? copy.unknownSize : formatBytes(size)}</span><span className={fit === 'recommended' ? 'text-emerald-600' : fit === 'incompatible' ? 'text-red-500' : 'text-amber-600'}>{copy[fit]}</span></div>
            </button>;
          })}
          {!filtered.length && <p className="p-5 text-center text-sm opacity-60">{copy.noModels}</p>}
        </div>
        {selected && <div className="space-y-3 rounded-xl bg-slate-500/5 p-3">
          <div className="flex items-center gap-2 text-xs opacity-65"><ShieldCheck size={15}/>{copy.source}</div>
          <p className="text-xs opacity-65">{copy.limitation}</p>
          <p className="text-xs opacity-65">{copy.onlineNeeded}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{copy.downloadSize}</span><strong>{exactSize ? formatBytes(exactSize) : copy.unknownSize}</strong></div>
          <button type="button" disabled={runtime !== 'ready' || busy || selectedFit === 'incompatible'} onClick={() => void loadModel(selected.model_id, !installed.includes(selected.model_id))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><ArrowDownToLine size={17}/>{installed.includes(selected.model_id) ? copy.load : copy.install}</button>
        </div>}
        {busy && <div className="space-y-2 rounded-xl border p-3"><div className="flex justify-between gap-2 text-xs"><span className="truncate">{progressText}</span><strong>{progress}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: progress + '%' }}/></div></div>}
      </section>}

      {viewMode === "chat" && <section className="flex min-h-[480px] min-w-0 flex-col rounded-2xl border p-4">
        <div className="flex items-center gap-2"><MessageSquare size={18}/><div><h2 className="font-bold">{copy.chat}</h2><p className="text-xs opacity-60">{copy.chatHint}</p></div><button type="button" onClick={() => void clearCurrentOfflineChat()} disabled={!messages.length} className="ms-auto rounded-lg border px-2.5 py-1.5 text-[10px] disabled:opacity-40">{dari ? "پاک‌کردن گفتگو" : "Clear chat"}</button></div>
        <div className="my-3 rounded-xl bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">{copy.privacy}</div><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={lowPowerMode} onChange={event => setLowPowerMode(event.target.checked)} />{dari ? "حالت کم‌مصرف (پاسخ کوتاه‌تر و فشار کمتر)" : "Low-power mode (shorter replies, lower workload)"}</label><span className="opacity-60">{lowPowerMode ? "256" : "512"} max tokens</span></div>{thermalWarning && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">{dari ? "مدت پردازش طولانی شد؛ برای کاهش گرما و مصرف باتری کمی استراحت بده." : "Long inference is taking over two minutes. Let the device cool down to reduce heat and battery drain."}</p>}
        {engineRef.current && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3 text-xs"><strong>{dari ? 'حالت آفلاین — مدل:' : 'Offline Mode — Model:'} {activeOfflineModelLabel || selectedId}</strong><button type="button" onClick={() => setViewMode('models')} className="rounded-lg border px-2.5 py-1.5">{dari ? 'تغییر مدل' : 'Change Model'}</button></div>}
        {!engineRef.current && <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center"><Sparkles size={34} className="opacity-40"/><p className="text-sm opacity-60">{ggufTasks.some(task => task.status === 'installed') ? (nativeRuntimeAvailable ? copy.loadGgufHint : copy.ggufRuntimeUnavailable) : installed.length === 0 ? copy.noOfflineModel : copy.choose}</p><button type="button" onClick={() => setViewMode('models')} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950">{dari ? 'انتخاب یا دانلود مدل' : 'Choose or download a model'}</button></div>}
        {engineRef.current && <div className="flex-1 space-y-3 overflow-y-auto py-3">{messages.map((message,index)=><div key={index} className={'max-w-[92%] whitespace-pre-wrap rounded-2xl p-3 text-sm leading-6 ' + (message.role === 'user' ? 'ms-auto bg-cyan-500/10' : 'me-auto bg-slate-500/10')}>{message.content}</div>)}{chatBusy && <div className="text-xs opacity-60">{dari ? 'در حال تولید پاسخ محلی…' : 'Generating locally…'}</div>}<div ref={chatEndRef}/></div>}
        <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void sendMessage(); }}>
          <input value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={copy.input} disabled={!engineRef.current || chatBusy} className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-3 text-sm outline-none disabled:opacity-40"/>
          {chatBusy && nativeEngineRef.current && <button type="button" onClick={() => nativeAbortRef.current?.abort()} className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-500">{dari ? 'لغو' : 'Cancel'}</button>}
          <button type="submit" disabled={!engineRef.current || !prompt.trim() || chatBusy} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{copy.send}</button>
        </form>
        <div className="mt-3 border-t pt-3"><div className="mb-2 text-xs font-semibold opacity-70">{copy.installed}</div>
          {installed.length === 0 ? <p className="text-xs opacity-55">{copy.noInstalled}</p> : installed.map(id=><div key={id} className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="min-w-0 break-all">{id}</span><button type="button" onClick={() => void removeMlcModel(id)} className="shrink-0 rounded-lg border px-2 py-1 text-[10px]">{dari ? 'حذف' : 'Delete'}</button></div>)}
        </div>
      </section>}

    {viewMode === "models" && <section className="space-y-4 rounded-2xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">{dari ? 'کتابخانه جهانی مدل‌ها' : 'Global Model Library'}</h2><p className="mt-1 text-xs opacity-65">{dari ? 'جست‌وجوی زنده مدل‌ها و فرمت‌ها در Hugging Face' : 'Live Hugging Face discovery across model formats'}</p></div><span className="text-xs opacity-60">{hfModels.length} {dari ? 'نتیجه' : 'results'}</span></div>
      <div className="flex items-center gap-2 rounded-xl border px-3"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={dari ? 'جست‌وجو؛ مثلاً Spark-X2.6' : 'Search models — e.g. Spark-X2.6'} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setHfFormat('gguf')} className={'rounded-full border px-3 py-1.5 text-xs ' + (hfFormat === 'gguf' ? 'border-cyan-400 bg-cyan-400/10' : 'opacity-65')}>GGUF</button><button type="button" onClick={() => setHfFormat('all')} className={'rounded-full border px-3 py-1.5 text-xs ' + (hfFormat === 'all' ? 'border-cyan-400 bg-cyan-400/10' : 'opacity-65')}>{dari ? 'همه فرمت‌های مدل زبانی' : 'All language-model formats'}</button></div>
      {hfError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"><span className="min-w-0 flex-1">{hfError}</span><button type="button" onClick={() => setHfRetry(value => value + 1)} className="shrink-0 rounded-lg border border-current/20 px-3 py-1.5 font-semibold">{dari ? 'تلاش دوباره' : 'Retry'}</button></div>}{hfBusy && <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs opacity-70"><LoaderCircle size={15} className="animate-spin" aria-hidden="true"/>{dari ? 'در حال دریافت مدل‌ها از Hugging Face…' : 'Loading models from Hugging Face…'}</p>}
      <section className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3"><div><h3 className="font-bold">{dari ? 'پیشنهاد ویژه: Spark X2.6' : 'Featured: Spark X2.6'}</h3><p className="mt-1 text-xs opacity-65">{dari ? 'نتایج زنده از Hugging Face' : 'Live results from Hugging Face'}</p></div><div className="grid gap-2 sm:grid-cols-2">{sparkModels.map(model => <button key={model.id} type="button" onClick={() => setHfSelected(model.id)} className={'rounded-xl border p-3 text-start ' + (hfSelected === model.id ? 'border-cyan-400 bg-cyan-400/10' : '')}><div className="break-all text-sm font-semibold">{model.id}</div><div className="mt-1 text-[11px] opacity-60">↓ {model.downloads.toLocaleString()} · ♥ {model.likes.toLocaleString()}</div></button>)}</div>{!sparkModels.length && <p className="text-xs opacity-60">{dari ? 'در حال دریافت نتایج Spark…' : 'Loading Spark results…'}</p>}</section>
      {hfRecommended.length > 0 && <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="text-sm font-bold">{dari ? 'پیشنهاد برای دستگاه شما' : 'Recommended for your device'}</div><div className="grid gap-2 sm:grid-cols-3">{hfRecommended.map(item => <button key={item.model.id} type="button" onClick={() => { pendingGgufPathRef.current = item.filePath; setHfSelected(item.model.id); }} className="rounded-lg border bg-slate-500/5 p-2 text-start"><div className="break-all text-xs font-semibold">{item.model.id}</div><div className="mt-1 text-[10px] opacity-65">{formatBytes(item.fileSize)} · {item.fit === 'recommended' ? copy.recommended : copy.limited}</div></button>)}</div></div>}      <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setHfCategories([])} className={'rounded-full border px-3 py-1.5 text-[11px] ' + (!hfCategories.length ? 'border-cyan-400 bg-cyan-400/10' : 'opacity-65')}>{dari ? 'همه مدل‌ها' : 'All Models'}</button>{['coding','learning','english','robotics','mathematics','science','general','creative'].map(category => <button key={category} type="button" onClick={() => setHfCategories(previous => previous.includes(category) ? previous.filter(item => item !== category) : [...previous, category])} className={'rounded-full border px-3 py-1.5 text-[11px] ' + (hfCategories.includes(category) ? 'border-cyan-400 bg-cyan-400/10' : 'opacity-65')}>{category}</button>)}</div>
      <div className="grid gap-2 sm:grid-cols-2">{hfModels.filter(model => !hfCategories.length || hfCategories.some(category => formatModelCategory(model.tags, model.pipeline_tag, model.id).includes(category) || (category === 'science' && model.tags.some(tag => /science|physics|chemistry|biology/i.test(tag))))).map(model => { const recommendation = hfRecommended.find(item => item.model.id === model.id); const categories = formatModelCategory(model.tags, model.pipeline_tag, model.id); return <button key={model.id} type="button" onClick={() => setHfSelected(model.id)} className={'rounded-xl border p-3 text-start ' + (hfSelected === model.id ? 'border-cyan-400 bg-cyan-400/10' : '')}><div className="break-all text-sm font-semibold">{model.id}</div><div className="mt-1 text-[10px] opacity-60">{model.id.split('/')[0]} · {categories.join(' / ')}</div><div className="mt-2 flex gap-3 text-[11px] opacity-65"><span>↓ {model.downloads.toLocaleString()}</span><span>♥ {model.likes.toLocaleString()}</span><span>{model.pipeline_tag || 'General'}</span></div>{recommendation && <div className="mt-2 text-[10px] font-semibold text-emerald-700">{formatBytes(recommendation.fileSize)} · {recommendation.fit === 'recommended' ? copy.recommended : copy.limited}</div>}</button>; })}</div>
      {!hfModels.length && !hfBusy && <div role="status" className="space-y-2 rounded-xl border border-dashed p-5 text-center"><p className="text-sm font-semibold">{dari ? 'مدلی پیدا نشد.' : 'No models found.'}</p><p className="text-xs opacity-65">{dari ? 'نام مدل یا فیلتر را تغییر بده؛ می‌توانی مدل‌های Spark را هم جست‌وجو کنی.' : 'Try a different model name or search for Spark X2.6.'}</p><button type="button" onClick={() => { setQuery('Spark-X2.6'); setHfFormat('gguf'); }} className="rounded-lg border px-3 py-2 text-xs font-semibold">{dari ? 'جست‌وجوی Spark X2.6' : 'Search Spark X2.6'}</button></div>}
      {hfHasMore && <button type="button" disabled={hfBusy} onClick={() => void loadMoreHf()} className="w-full rounded-xl border px-4 py-2 text-sm">{dari ? 'مدل‌های بیشتر' : 'Load more'}</button>}
      {hfSelected && <div className="space-y-3 rounded-xl bg-slate-500/5 p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="break-all text-sm">{hfSelected}</strong><span className="text-xs">{hfRepository ? formatBytes(hfRepository.totalBytes) : '…'}</span></div>
        {selectedHfModel && <div className="grid gap-2 rounded-lg border border-slate-500/15 p-3 text-xs sm:grid-cols-2"><div><span className="opacity-60">{dari ? 'نام مدل' : 'Model name'}</span><div className="mt-1 break-all font-semibold">{selectedHfModel.id.split('/').pop()}</div></div><div><span className="opacity-60">{dari ? 'ناشر' : 'Publisher'}</span><div className="mt-1 font-semibold">{selectedHfModel.id.split('/')[0]}</div></div><div><span className="opacity-60">{dari ? 'توضیحات' : 'Description'}</span><div className="mt-1">{selectedHfModel.description || selectedHfModel.pipeline_tag || selectedHfModel.tags.slice(0, 4).join(', ') || (dari ? 'توضیحات در API موجود نیست.' : 'No description supplied by the catalog API.')}</div></div><div><span className="opacity-60">{dari ? 'دانلودها / پسندها' : 'Downloads / likes'}</span><div className="mt-1 font-semibold">{selectedHfModel.downloads.toLocaleString()} / {selectedHfModel.likes.toLocaleString()}</div></div><div><span className="opacity-60">{dari ? 'حجم فایل انتخاب‌شده' : 'Selected file size'}</span><div className="mt-1 font-semibold">{selectedGgufFile ? formatBytes(selectedGgufFile.size) : hfRepository ? formatBytes(hfRepository.totalBytes) : '—'}</div></div><div><span className="opacity-60">{dari ? 'سازگاری دستگاه' : 'Device compatibility'}</span><div className="mt-1 font-semibold">{!device ? (dari ? 'در حال بررسی' : 'Checking') : ggufGated ? (dari ? 'مخزن محدود' : 'Gated repository') : ggufRamBlocked || ggufStorageBlocked ? (dari ? 'ناسازگار' : 'Incompatible') : ggufRamLimited ? (dari ? 'با محدودیت' : 'Limited') : !usesNativeOfflineDownloads() ? (dari ? 'ذخیره در وب؛ بدون اجرای GGUF' : 'Browser storage only; GGUF inference unavailable') : ggufRuntimeBlocked ? (dari ? 'موتور بومی در دسترس نیست' : 'Native runtime unavailable') : (dari ? 'سازگار بر اساس برآورد' : 'Estimated compatible')}</div></div></div>}
        {hfRepository && <>{hfRepository.ggufFiles.length > 0 ? <><div className="flex flex-wrap gap-2">{(['Q4_K_M','Q6_K','Q8_0'] as const).map(quant => { const option = hfRepository.ggufFiles.find(file => file.quantization === quant); return option ? <button key={quant} type="button" onClick={() => setHfQuantization(option.path)} className={'rounded-lg border px-2.5 py-2 text-[11px] ' + (hfQuantization === option.path ? 'border-cyan-400 bg-cyan-400/10' : 'opacity-75')}>{quant} · {formatBytes(option.size)}</button> : null; })}</div><label className="block text-xs font-semibold">{dari ? 'انتخاب فایل و Quantization' : 'Select GGUF file / quantization'}<select value={hfQuantization} onChange={event => setHfQuantization(event.target.value)} className="mt-2 w-full rounded-lg border bg-transparent p-2">{hfRepository.ggufFiles.map(file => <option key={file.path} value={file.path}>{file.name} · {formatBytes(file.size)}{file.quantization ? ' · ' + file.quantization : ''}</option>)}</select></label></> : <p className="rounded-lg bg-amber-500/10 p-3 text-xs">{dari ? 'این مخزن فایل GGUF ندارد. فرمت‌های دیگر فعلاً فقط قابل مشاهده‌اند؛ تا زمانی که Runtime سازگار اضافه نشود، دکمه دانلود/اجرا فعال نمی‌شود.' : 'This repository has no GGUF file. Other formats are discoverable, but download and inference remain disabled until a compatible runtime is implemented.'}</p>}<div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!!ggufBusyId || !hfQuantization || ggufPreflightBlocked} onClick={() => void downloadSelectedGguf()} className="rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">{dari ? 'دانلود و نصب فایل GGUF' : 'Download & install GGUF'}</button><a className="rounded-lg border px-3 py-2.5 text-xs" href={'https://huggingface.co/' + hfSelected} target="_blank" rel="noreferrer">{dari ? 'مخزن' : 'Repository'}</a></div><p className="text-xs text-amber-700">{usesNativeOfflineDownloads() ? (dari ? 'اندروید از دانلود پس‌زمینه با Foreground Service، WorkManager، ادامه Range/ETag و توقف/ادامه دستی استفاده می‌کند.' : 'Android uses a foreground WorkManager transfer with HTTP Range, ETag validation, persistent partial files, Pause and Resume.') : (dari ? 'فایل در حافظه خصوصی مرورگر ذخیره و SHA-256 محاسبه می‌شود. اگر مخزن هش معتبر ارائه کند، با آن مقایسه می‌شود.' : 'The file is stored in browser-private OPFS storage and SHA-256 is calculated; when the repository provides a trusted hash it is compared.')} {dari ? 'دانلود به معنی آماده بودن موتور اجرای GGUF نیست.' : 'Downloading does not mean the GGUF inference runtime is ready.'}</p>{!usesNativeOfflineDownloads() && <p role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800">{dari ? 'محدودیت مرورگر: فایل GGUF در مرورگر فقط ذخیره می‌شود و قابل اجرا نیست. برای اجرای آفلاین در وب، از مدل‌های از پیش پشتیبانی‌شده WebLLM در بخش مدل‌ها استفاده کن.' : 'Browser limitation: GGUF files can be stored in the browser but cannot be executed there. For browser inference, choose a prebuilt WebLLM-supported model from the local model catalog.'}</p>}{ggufPreflightBlocked && <p className="text-xs text-red-600">{ggufGated ? (dari ? 'این مخزن محدود یا نیازمند دسترسی است؛ دانلود عمومی ممکن نیست.' : 'This repository is gated; public unauthenticated download is unavailable.') : ggufRuntimeBlocked ? (dari ? 'موتور بومی GGUF در این دستگاه یا نسخه برنامه در دسترس نیست.' : 'The native GGUF runtime is unavailable on this device or in this build.') : ggufStorageBlocked ? (dari ? 'فضای ذخیره‌سازی کافی نیست.' : 'Not enough free storage for this model.') : ggufStorageUnknown ? (dari ? 'فضای ذخیره‌سازی قابل بررسی نیست؛ دانلود تا زمان بررسی غیرفعال است.' : 'Free storage could not be verified; download is disabled until storage can be checked.') : ggufRamBlocked ? (dari ? 'حافظه RAM این دستگاه برای بارگذاری این مدل کافی نیست.' : 'Estimated RAM requirement exceeds this device budget.') : ggufRamLimited ? (dari ? 'حافظه آزاد فعلی کم است؛ پیش از اجرای مدل برنامه‌های دیگر را ببند.' : 'Currently available RAM is low; close other apps before loading the model.') : (dari ? 'اندازه فایل معتبر یا مشخصات لازم برای بررسی سازگاری در دسترس نیست.' : 'File size or required compatibility data is unavailable; download is disabled until preflight can verify it.')}</p>}{ggufBusyId === hfSelected + '/' + hfQuantization && <div className="space-y-2"><div className="flex justify-between text-xs"><span>{formatBytes(ggufProgress[ggufBusyId]?.downloadedBytes || 0)} / {formatBytes(ggufProgress[ggufBusyId]?.totalBytes)}</span><span>{ggufProgress[ggufBusyId]?.percent ?? '—'}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full bg-cyan-400" style={{width:(ggufProgress[ggufBusyId]?.percent ?? 0)+'%'}}/></div><button type="button" onClick={() => void pauseSelectedGguf(ggufBusyId)} className="rounded-lg border px-3 py-1.5 text-xs">{dari ? 'توقف موقت' : 'Pause'}</button></div>}</>}
      </div>}
    </section>}
    {viewMode === "models" && <section className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{dari ? 'فایل‌های GGUF دانلودشده' : 'Downloaded GGUF files'}</h2><div className="flex items-center gap-2"><span className="text-xs opacity-60">{ggufTasks.filter(task => task.status === 'installed').length}</span><button type="button" onClick={() => void downloadOfflineDiagnosticReport().catch(() => setHfError(dari ? 'گزارش خطا صادر نشد.' : 'Could not export the diagnostic report.'))} className="rounded-lg border px-2.5 py-1.5 text-[10px]">{dari ? 'گزارش خطا' : 'Export diagnostics'}</button><button type="button" onClick={() => void downloadOfflineMetricsReport().catch(() => setHfError(dari ? 'گزارش آمار صادر نشد.' : 'Could not export offline metrics.'))} className="rounded-lg border px-2.5 py-1.5 text-[10px]">{dari ? 'گزارش آمار' : 'Export metrics'}</button></div></div>
      {!ggufTasks.length && <p className="text-xs opacity-60">{dari ? 'هنوز فایل GGUF دانلود نشده است.' : 'No GGUF files downloaded yet.'}</p>}
      {ggufTasks.some(task => task.status === 'installed') && <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700">{dari ? 'فایل‌ها در دستگاه ذخیره شده‌اند؛ برای اجرای آن‌ها هنوز موتور GGUF (llama.cpp) باید اضافه شود.' : 'These files are stored locally. They cannot be used for inference until the GGUF runtime (llama.cpp) is integrated.'}</p>}
      {ggufTasks.map(task => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-500/5 p-3"><div className="min-w-0 flex-1"><div className="break-all text-xs font-semibold">{task.repoId} / {task.fileName}</div><div className="mt-1 text-[11px] opacity-60">{formatBytes(task.downloadedBytes)} · {task.status === 'installed' ? (dari ? 'دانلودشده' : 'Downloaded') : task.status}{task.status === 'installed' ? (task.hashVerified ? (dari ? ' · هش تأیید شد' : ' · hash verified') : (dari ? ' · هش محاسبه شد؛ منبع تأیید ندارد' : ' · hash calculated; source not verified')) : ''}{task.error ? ' · ' + task.error : ''}</div></div><div className="flex gap-2">{task.status !== 'installed' && task.status !== 'downloading' && <button type="button" disabled={!!ggufBusyId} onClick={() => void resumeGguf(task)} className="rounded-lg border px-2 py-1 text-xs">{dari ? 'ادامه' : 'Resume'}</button>}{task.status === 'installed' && nativeRuntimeAvailable && task.localPath && <button type="button" disabled={busy} onClick={() => void loadNativeGgufModel(task)} className="rounded-lg bg-cyan-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40">{dari ? 'اجرا' : 'Load model'}</button>}{task.status === 'installed' && usesNativeOfflineDownloads() && !nativeRuntimeAvailable && <span className="text-[10px] text-amber-700">{dari ? 'موتور اجرا در این نسخه موجود نیست' : 'Native runtime unavailable in this build'}</span>}<button type="button" onClick={() => void removeGguf(task.id)} className="rounded-lg border px-2 py-1 text-xs">{dari ? 'حذف' : 'Delete'}</button></div></div>)}
    </section>}
  </section>;
}
