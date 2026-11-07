import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AFGJarvis, type JarvisStatus, type JarvisAction, type JarvisSpeechEvent, type JarvisSpeechLanguage } from '@afg-ai/capacitor-jarvis';
import type { Language } from '../../types/afg';
import { parseJarvisCommand } from '../../lib/jarvis-command-engine';
import { buildJarvisLocalCommandPrompt, extractJarvisLocalCommand, buildJarvisNeedleCommandConfig, extractJarvisNeedleCommand } from '../../lib/jarvis-local-agent';
import { downloadNeedle3Model, listOfflineDownloads, type OfflineDownloadState } from '../../lib/offlineModelDownloads';
import { generateNativeLlamaResponse, getNativeLlamaRuntimeInfo, loadNativeLlamaModel, unloadNativeLlamaModel, type NativeLlamaRuntimeInfo } from '../../lib/offlineLlamaRuntime';
import { generateNativeNeedleResponse, getNativeNeedleRuntimeInfo, loadNativeNeedleModel, NEEDLE3_MODEL_ID, type NativeNeedleRuntimeInfo } from '../../lib/offlineNeedleRuntime';

const actions: Array<{ id: JarvisAction; en: string; fa: string }> = [
  { id: 'back', en: 'Back', fa: 'بازگشت' }, { id: 'home', en: 'Home', fa: 'صفحه اصلی' },
  { id: 'notifications', en: 'Notifications', fa: 'اعلان‌ها' }, { id: 'quickSettings', en: 'Quick settings', fa: 'تنظیمات سریع' },
  { id: 'scrollForward', en: 'Scroll down', fa: 'پایین رفتن' }, { id: 'scrollBackward', en: 'Scroll up', fa: 'بالا رفتن' },
];
const apps = [
  { packageName: 'com.android.settings', en: 'Android Settings', fa: 'تنظیمات اندروید' },
  { packageName: 'com.google.android.youtube', en: 'YouTube', fa: 'یوتیوب' },
  { packageName: 'org.telegram.messenger', en: 'Telegram', fa: 'تلگرام' },
  { packageName: 'com.whatsapp', en: 'WhatsApp', fa: 'واتساپ' },
];

export function AfgJarvisView({ language }: { language: Language }) {
  const dari = language === 'dari';
  const rtl = ['dari', 'persian', 'pashto', 'arabic', 'urdu'].includes(language);
  const native = Capacitor.isNativePlatform();
  const androidNative = Capacitor.getPlatform() === 'android';
  const [status, setStatus] = useState<JarvisStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [packageName, setPackageName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [typedText, setTypedText] = useState('');
  const [speechState, setSpeechState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [localCommand, setLocalCommand] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [deviceData, setDeviceData] = useState<Record<string, any>>({});
  const [deviceNumber, setDeviceNumber] = useState('');
  const [deviceMessage, setDeviceMessage] = useState('');
  const [clipboardInput, setClipboardInput] = useState('');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [localRuntime, setLocalRuntime] = useState<NativeLlamaRuntimeInfo | null>(null);
  const [needleRuntime, setNeedleRuntime] = useState<NativeNeedleRuntimeInfo | null>(null);
  const [needleModel, setNeedleModel] = useState<OfflineDownloadState | null>(null);
  const [needleLoaded, setNeedleLoaded] = useState(false);
  const [needleDownloadBusy, setNeedleDownloadBusy] = useState(false);
  const [needleDownloadPercent, setNeedleDownloadPercent] = useState<number | null>(null);
  const [localModels, setLocalModels] = useState<OfflineDownloadState[]>([]);
  const [selectedLocalModelId, setSelectedLocalModelId] = useState('');
  const [loadedLocalModelId, setLoadedLocalModelId] = useState('');
  const [localAiPrompt, setLocalAiPrompt] = useState('');
  const [localAiReply, setLocalAiReply] = useState('');
  const [localAiError, setLocalAiError] = useState('');
  const [localAiBusy, setLocalAiBusy] = useState(false);
  const [pendingAiCommand, setPendingAiCommand] = useState('');
  const localModelLoadedRef = useRef(false);
  const label = (en: string, fa: string) => dari ? fa : en;
  const speechLanguage: JarvisSpeechLanguage = language === 'dari' ? 'fa-AF' : language === 'persian' ? 'fa-IR' : language === 'pashto' ? 'ps-AF' : language === 'arabic' ? 'ar' : 'en-US';
  const card = 'rounded-2xl border border-cyan-400/20 bg-slate-950/50 p-4 shadow-[0_0_28px_rgba(6,182,212,.06)]';
  const button = 'rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40';
  const refresh = useCallback(async () => {
    if (!native) return;
    try { setStatus(await AFGJarvis.getStatus()); setError(''); }
    catch (e: any) { setError(e?.message || 'Could not read Android service status.'); }
  }, [native]);
  const refreshLocalAi = useCallback(async () => {
    if (!androidNative) return;
    try {
      const [runtimeInfo, needleInfo, downloads] = await Promise.all([getNativeLlamaRuntimeInfo(), getNativeNeedleRuntimeInfo(), listOfflineDownloads()]);
      setLocalRuntime(runtimeInfo);
      setNeedleRuntime(needleInfo);
      setNeedleLoaded(needleInfo.modelReady);
      setNeedleModel(downloads.find(item => item.id === NEEDLE3_MODEL_ID) || null);
      setLocalModels(downloads.filter(item => item.fileName.toLowerCase().endsWith('.gguf')));
      setSelectedLocalModelId(current => current || downloads.find(item => item.fileName.toLowerCase().endsWith('.gguf') && item.status === 'installed' && item.localPath && item.expectedSha256 && item.hashVerified === true)?.id || '');
      setLocalAiError('');
    } catch (e: any) {
      setLocalAiError(e?.message || 'Unable to inspect the local Android model runtime.');
    }
  }, [androidNative]);
  const verifiedLocalModels = localModels.filter(item => item.status === 'installed' && Boolean(item.localPath) && Boolean(item.expectedSha256) && item.hashVerified === true);
  const selectedLocalModel = verifiedLocalModels.find(item => item.id === selectedLocalModelId) || null;
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void refreshLocalAi(); }, [refreshLocalAi]);
  useEffect(() => () => { if (localModelLoadedRef.current) void unloadNativeLlamaModel().catch(() => undefined); }, []);
  useEffect(() => {
    if (!native) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [native, refresh]);
  useEffect(() => {
    if (!native) return;
    let active = true;
    let handle: { remove: () => Promise<void> } | undefined;
    void AFGJarvis.addListener('speechEvent', (event: JarvisSpeechEvent) => {
      if (!active) return;
      setSpeechState(event.state);
      if (event.text) setTranscript(event.text);
      setSpeechError(event.state === 'error' ? event.error : '');
    }).then(value => { handle = value; if (!active) void value.remove(); });
    return () => {
      active = false;
      if (handle) void handle.remove();
      void AFGJarvis.stopListening().catch(() => undefined);
    };
  }, [native]);
  async function run(key: string, task: () => Promise<unknown>) {
    setBusy(key); setError(''); setNotice('');
    try {
      const result = await task();
      if (result && typeof result === 'object') {
        const outcome = result as Record<string, unknown>;
        const failed = ['performed', 'clicked', 'typed', 'opened', 'started', 'copied', 'stopped']
          .find(field => outcome[field] === false);
        if (failed) throw new Error(label('Android reported that this action was not completed.', 'اندروید گزارش داد که این عملیات انجام نشد.'));
      }
      setNotice(label('Operation completed on this device.', 'عملیات در همین دستگاه انجام شد.'));
      await refresh();
    } catch (e: any) {
      setError(e?.message || label('Command failed.', 'اجرای فرمان ناموفق بود.'));
    } finally {
      setBusy('');
    }
  }
  function confirmLocalCommand(raw: string) {
    const parsed = parseJarvisCommand(raw);
    if (parsed.kind === 'app') {
      if (window.confirm(label('Open ' + parsed.label + '?', 'برنامه ' + parsed.label + ' باز شود؟'))) {
        void run('voice-app', () => AFGJarvis.openApp({ packageName: parsed.packageName }));
      }
    } else if (parsed.kind === 'action') {
      if (window.confirm(label('Run ' + parsed.action + '?', 'فرمان ' + parsed.action + ' اجرا شود؟'))) {
        void run('voice-action', () => AFGJarvis.performAction({ action: parsed.action }));
      }
    } else if (parsed.kind === 'device') {
      const labels: Record<string,string> = {
        battery: label('Read battery status?', 'وضعیت باتری خوانده شود؟'),
        network: label('Read network status?', 'وضعیت شبکه خوانده شود؟'),
        sensors: label('List available sensors?', 'حسگرهای موجود فهرست شود؟'),
        vibrate: label('Vibrate the phone for 500 ms?', 'گوشی ۵۰۰ میلی‌ثانیه بلرزد؟'),
        torchOn: label('Turn on the flashlight?', 'چراغ‌قوه روشن شود؟'),
        torchOff: label('Turn off the flashlight?', 'چراغ‌قوه خاموش شود؟'),
        location: label('Read the current location? Android permission will be requested.', 'موقعیت فعلی خوانده شود؟ مجوز اندروید درخواست می‌شود.'),
        contacts: label('Read up to 20 contacts? Android permission will be requested.', 'تا ۲۰ مخاطب خوانده شود؟ مجوز اندروید درخواست می‌شود.'),
        recentSms: label('Read the last 5 SMS messages? Android permission will be requested.', 'پنج پیامک اخیر خوانده شود؟ مجوز اندروید درخواست می‌شود.'),
        camera: label('Open camera? You will take the photo yourself.', 'دوربین باز شود؟ عکس را خودتان می‌گیرید.'),
      };
      if (window.confirm(labels[parsed.action])) {
        const tasks: Record<string,() => Promise<unknown>> = {
          battery: async () => { const battery = await AFGJarvis.getBatteryStatus(); setDeviceData(v => ({...v,battery})); },
          network: async () => { const network = await AFGJarvis.getNetworkStatus(); setDeviceData(v => ({...v,network})); },
          sensors: async () => { const sensors = await AFGJarvis.getSensors(); setDeviceData(v => ({...v,sensors})); },
          vibrate: () => AFGJarvis.vibrate({durationMs:500}),
          torchOn: async () => { await AFGJarvis.requestCameraPermission(); await AFGJarvis.setTorch({enabled:true}); setTorchEnabled(true); },
          torchOff: async () => { await AFGJarvis.requestCameraPermission(); await AFGJarvis.setTorch({enabled:false}); setTorchEnabled(false); },
          location: async () => { await AFGJarvis.requestLocationPermission(); const location = await AFGJarvis.getLocation(); setDeviceData(v => ({...v,location})); },
          contacts: async () => { await AFGJarvis.requestContactsPermission(); const contacts = await AFGJarvis.getContacts({limit:20}); setDeviceData(v => ({...v,contacts})); },
          recentSms: async () => { await AFGJarvis.requestSmsReadPermission(); const sms = await AFGJarvis.getRecentSms({limit:5}); setDeviceData(v => ({...v,sms})); },
          camera: async () => { const photo = await AFGJarvis.takePhoto(); setDeviceData(v => ({...v,photo})); },
        };
        void run('voice-device', tasks[parsed.action]);
      }
    } else {
      setSpeechError(label('No safe local command matched. Try open Telegram, battery status, flashlight, location, or a Dari/Pashto phrase.', 'فرمان امن محلی شناخته نشد. تلگرام، وضعیت باتری، چراغ‌قوه، موقعیت یا عبارت دری/پشتو را امتحان کنید.'));
    }
  }
  async function loadJarvisLocalModel() {
    if (needleRuntime?.modelLoaded || needleLoaded) { setLocalAiError(label('Needle 3 is resident in memory. Restart AFG AI before switching back to GGUF.', 'مدل Needle 3 هنوز در حافظه است. برای برگشت به GGUF برنامه AFG AI را دوباره راه‌اندازی کنید.')); return; }
    if (!selectedLocalModel?.localPath) { setLocalAiError(label('Choose a downloaded, SHA-256 verified GGUF model first.', 'ابتدا یک مدل GGUF دانلودشده و تأییدشده با SHA-256 انتخاب کنید.')); return; }
    setLocalAiBusy(true); setLocalAiError(''); setLocalAiReply(''); setPendingAiCommand('');
    try {
      await unloadNativeLlamaModel().catch(() => undefined);
      await loadNativeLlamaModel(selectedLocalModel.localPath, 1024, 2);
      localModelLoadedRef.current = true;
      setLoadedLocalModelId(selectedLocalModel.id);
    } catch (e: any) {
      localModelLoadedRef.current = false; setLoadedLocalModelId('');
      setLocalAiError(e?.message || label('The GGUF model could not be loaded. Check free RAM and model compatibility.', 'مدل GGUF بارگذاری نشد. حافظه آزاد و سازگاری مدل را بررسی کنید.'));
    } finally { setLocalAiBusy(false); }
  }

  async function downloadJarvisNeedleModel() {
    if (needleDownloadBusy) return;
    setNeedleDownloadBusy(true); setNeedleDownloadPercent(0); setLocalAiError('');
    try {
      const downloaded = await downloadNeedle3Model({
        onProgress: progress => setNeedleDownloadPercent(progress.percent),
      });
      setNeedleModel(downloaded);
      await refreshLocalAi();
      if (downloaded.hashVerified !== true) throw new Error('Needle 3 download completed without a verified SHA-256 digest.');
    } catch (e: any) {
      setLocalAiError(e?.message || label('Needle 3 download failed.', 'دانلود Needle 3 ناموفق بود.'));
    } finally {
      setNeedleDownloadBusy(false);
      setNeedleDownloadPercent(null);
    }
  }

  async function loadJarvisNeedleModel() {
    if (!needleRuntime?.available) { setLocalAiError(needleRuntime?.reason || 'Needle 3 Android runtime is unavailable in this APK.'); return; }
    if (!needleModel?.localPath || needleModel.status !== 'installed' || needleModel.hashVerified !== true) {
      setLocalAiError(label('Download and verify the official Needle 3 model first.', 'ابتدا مدل رسمی Needle 3 را دانلود و تأیید کنید.'));
      return;
    }
    setLocalAiBusy(true); setLocalAiError(''); setLocalAiReply(''); setPendingAiCommand('');
    try {
      if (localModelLoadedRef.current) {
        await unloadNativeLlamaModel();
        localModelLoadedRef.current = false;
        setLoadedLocalModelId('');
      }
      const config = buildJarvisNeedleCommandConfig(language);
      await loadNativeNeedleModel(needleModel.localPath, config.systemPrompt, config.toolsJson);
      setNeedleLoaded(true);
      setNeedleRuntime(current => current ? { ...current, modelLoaded: true, modelReady: true } : current);
    } catch (e: any) {
      setLocalAiError(e?.message || label('Needle 3 could not load. Check the model file and available RAM.', 'Needle 3 بارگذاری نشد. فایل مدل و حافظه آزاد را بررسی کنید.'));
    } finally { setLocalAiBusy(false); }
  }

  async function unloadJarvisLocalModel() {
    setLocalAiBusy(true);
    try { await unloadNativeLlamaModel(); localModelLoadedRef.current = false; setLoadedLocalModelId(''); setPendingAiCommand(''); setLocalAiReply(''); }
    catch (e: any) { setLocalAiError(e?.message || 'Unable to unload the local model.'); }
    finally { setLocalAiBusy(false); }
  }

  async function interpretWithLocalAi() {
    const request = localAiPrompt.trim();
    if (!request || request.length > 300 || (!loadedLocalModelId && !needleLoaded) || localAiBusy) return;
    setLocalAiBusy(true); setLocalAiError(''); setLocalAiReply(''); setPendingAiCommand('');
    try {
      let candidate: string | null;
      if (needleLoaded) {
        const raw = await generateNativeNeedleResponse(request, 96);
        candidate = extractJarvisNeedleCommand(raw);
      } else {
        const raw = await generateNativeLlamaResponse([
          { role: 'system', content: buildJarvisLocalCommandPrompt(language) },
          { role: 'user', content: request },
        ], 96);
        candidate = extractJarvisLocalCommand(raw);
      }
      if (!candidate) { setLocalAiReply(label('No sufficiently confident, safe command was identified. Nothing was executed.', 'فرمان امن با اطمینان کافی شناسایی نشد؛ هیچ عملی اجرا نشد.')); return; }
      const parsed = parseJarvisCommand(candidate);
      if (parsed.kind === 'unknown') { setLocalAiReply(label('The local model suggested an unsupported action, so nothing was executed.', 'مدل محلی فرمان پشتیبانی‌نشده پیشنهاد کرد؛ بنابراین هیچ عملی اجرا نشد.')); return; }
      setPendingAiCommand(candidate);
      setLocalAiReply(label('A supported action was identified. Review it and confirm before execution: ', 'یک فرمان پشتیبانی‌شده شناسایی شد. پیش از اجرا آن را بررسی و تأیید کنید: ') + candidate);
    } catch (e: any) { setLocalAiError(e?.message || label('Local AI command understanding failed.', 'درک فرمان با هوش محلی ناموفق بود.')); }
    finally { setLocalAiBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6" dir={rtl ? 'rtl' : 'ltr'}>
    <header className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 sm:p-7">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/40 bg-cyan-300/10 text-3xl text-cyan-200">◉</div>
        <div><p className="text-xs font-bold tracking-[.25em] text-cyan-300">AFG AI</p><h1 className="mt-1 text-2xl font-black text-white">{label('AFG AI assistant', 'دستیار AFG AI')}</h1><p className="mt-1 text-sm text-slate-300">{label('Local Android controls with your explicit approval.', 'کنترل محلی اندروید با تأیید مستقیم شما.')}</p></div></div>
    </header>
    {!native && <section className={card}><p className="font-semibold text-amber-300">{label('Android app required', 'نسخه اندروید لازم است')}</p><p className="mt-2 text-sm text-slate-300">{label('Device-control features are available only in the installed AFG AI Android app, not in a browser tab.', 'قابلیت‌های کنترل دستگاه فقط در نسخه نصب‌شده اندروید AFG AI فعال‌اند، نه در مرورگر.')}</p></section>}
    {native && <>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-white">{label('Voice control', 'کنترل صوتی')}</h2><span className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-200">{speechState}</span></div>
        <p className="mt-2 text-xs leading-5 text-slate-400">{label('Android speech recognition is requested with its offline preference. The recognition provider may ignore it or require network access; offline operation is not guaranteed. For Afghan Dari, the app requests the fa-AF locale; actual recognition depends on the speech service and its installed language packs.', 'تشخیص گفتار اندروید با درخواست اولویت آفلاین اجرا می‌شود؛ اما سرویس تشخیص ممکن است این درخواست را نادیده بگیرد یا به اینترنت نیاز داشته باشد. آفلاین بودن تضمین‌شده نیست. برای دری افغانستان، برنامه زبان fa-AF را درخواست می‌کند؛ تشخیص واقعی به پشتیبانی سرویس گفتار و بسته زبان نصب‌شده بستگی دارد.')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={button} disabled={!!busy || !status?.speechRecognizerAvailable} onClick={() => void run('listen', async () => { await AFGJarvis.requestMicrophonePermission(); setSpeechError(''); setTranscript(''); await AFGJarvis.startListening({ language: speechLanguage }); })}>{label('Start listening', 'شروع شنیدن')}</button>
          <button className={button} disabled={!!busy} onClick={() => void run('stop', () => AFGJarvis.stopListening())}>{label('Stop', 'توقف')}</button>
        </div>
        {transcript && <p className="mt-3 rounded-xl bg-black/30 p-3 text-sm text-white">{transcript}</p>}
        {speechError && <p role="alert" className="mt-2 text-sm text-rose-300">{speechError}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className={button} disabled={!transcript.trim() || !!busy} onClick={() => confirmLocalCommand(transcript)}>{label('Confirm voice command', 'تأیید فرمان صوتی')}</button>
          <button className={button} disabled={!transcript.trim() || !!busy || !status?.ttsAvailable} onClick={() => void run('speak', () => AFGJarvis.speak({ text: transcript, language: speechLanguage }))}>{label('Speak transcript', 'خواندن متن با صدا')}</button>
        </div>
        <p className="mt-3 text-xs text-slate-400">{label('Only listed app-launch and navigation phrases are mapped to actions, and every action requires your confirmation. Unknown speech is never executed as a command.', 'فقط عبارت‌های مشخص‌شده برای بازکردن برنامه و پیمایش به فرمان تبدیل می‌شوند و هر فرمان نیازمند تأیید شماست. گفتار ناشناخته هرگز خودکار اجرا نمی‌شود.')}</p>
        <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
          <p className="text-sm font-semibold text-violet-200">{label('Offline text command', 'فرمان متنی آفلاین')}</p>
          <p className="mt-1 text-xs text-slate-400">{label('Type a supported phrase. Matching runs on this device without an AI or network request.', 'یک عبارت پشتیبانی‌شده بنویسید. تشخیص فرمان روی همین دستگاه و بدون درخواست هوش مصنوعی یا اینترنت انجام می‌شود.')}</p>
          <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (localCommand.trim()) confirmLocalCommand(localCommand); }}>
            <input value={localCommand} onChange={event => setLocalCommand(event.target.value)} maxLength={120} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white" placeholder={label('e.g. open Telegram / باز کن تلگرام', 'مثلاً باز کن تلگرام / کورپاڼه')} />
            <button className={button} disabled={!localCommand.trim() || !!busy}>{label('Run', 'اجرا')}</button>
          </form>
        </div>
      </section>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-white">{label('Local AI command brain', 'مغز هوش مصنوعی محلی')}</h2>
          <span className="rounded-full border border-violet-400/25 px-2 py-1 text-xs text-violet-200">{localRuntime?.available ? localRuntime.engine + ' · ' + localRuntime.abi : label('Runtime unavailable', 'موتور در دسترس نیست')}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">{label('AFG AI can use a GGUF model already downloaded in Offline AI Hub. This local model only translates your request into a strict allowlisted device command. It never receives permission to call Android tools directly; the existing command parser and your confirmation remain mandatory. Inference stays on this phone.', 'AFG AI می‌تواند از مدل GGUF که قبلاً در مرکز هوش آفلاین دانلود کرده‌اید استفاده کند. این مدل فقط درخواست شما را به یک فرمان محدود و مجاز دستگاه تبدیل می‌کند؛ مستقیماً اجازه اجرای ابزارهای اندروید را ندارد و بررسی فرمان و تأیید شما همچنان اجباری است. پردازش روی همین گوشی انجام می‌شود.')}</p>
        {!androidNative && <p className="mt-3 text-sm text-amber-200">{label('These native runtimes are available only in the Android APK.', 'این موتورهای بومی فقط در نسخه APK اندروید موجود اند.')}</p>}
        {androidNative && <>
          <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-cyan-100">Needle 3 / Cactus · ARM64</h3>
              <span className="text-xs text-cyan-200">{needleRuntime?.available ? (needleRuntime.modelLoaded ? label('Model resident', 'مدل در حافظه') : label('Runtime ready', 'موتور آماده')) : label('Runtime unavailable', 'موتور موجود نیست')}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{label('Tiny on-device intent model. The engine is packaged in the APK; its 35 MB .cact weights are downloaded once and verified before loading.', 'مدل کوچک برای فهم فرمان روی گوشی. موتور داخل APK است؛ وزن‌های مدل حدود ۳۵ مگابایت است و یک‌بار دانلود و پیش از بارگذاری بررسی می‌شود.')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={button} disabled={needleDownloadBusy || needleModel?.status === 'installed' && needleModel.hashVerified === true || !needleRuntime?.available || localAiBusy} onClick={() => void downloadJarvisNeedleModel()}>
                {needleDownloadBusy ? label('Downloading Needle 3…', 'در حال دانلود Needle 3…') : needleModel?.status === 'installed' && needleModel.hashVerified === true ? label('Needle 3 model verified', 'مدل Needle 3 تأیید شد') : label('Download Needle 3 model (~35 MB)', 'دانلود مدل Needle 3 (حدود ۳۵ مگابایت)')}
              </button>
              <button type="button" className={button} disabled={localAiBusy || !needleRuntime?.available || !needleModel?.localPath || needleModel.status !== 'installed' || needleModel.hashVerified !== true} onClick={() => void loadJarvisNeedleModel()}>
                {needleLoaded ? label('Reload Needle 3', 'بارگذاری دوباره Needle 3') : label('Load Needle 3', 'بارگذاری Needle 3')}
              </button>
            </div>
            {needleDownloadBusy && <p className="mt-2 text-xs text-cyan-200">{needleDownloadPercent === null ? label('Download in progress…', 'دانلود در جریان است…') : needleDownloadPercent + '%'} </p>}
            {needleModel?.status === 'installed' && needleModel.hashVerified && <p className="mt-2 text-xs text-emerald-300">{label('SHA-256 verified: ', 'SHA-256 تأیید شد: ')}{needleModel.computedSha256}</p>}
            {needleRuntime?.modelLoaded && <p className="mt-2 text-xs text-amber-200">{label('Needle keeps its model memory until AFG AI is fully closed. Restart the app before switching back to GGUF.', 'Needle حافظه مدل را تا بسته‌شدن کامل AFG AI نگه می‌دارد. پیش از برگشت به GGUF برنامه را کامل ببندید و دوباره باز کنید.')}</p>}
            {needleRuntime && !needleRuntime.available && <p className="mt-2 text-xs text-amber-200">{needleRuntime.reason}</p>}
          </div>
          <p className="mt-3 text-sm text-slate-300">{label('Native runtime', 'موتور بومی')}: <strong className={localRuntime?.available ? 'text-emerald-300' : 'text-amber-300'}>{localRuntime?.available ? label('Ready', 'آماده') : localRuntime?.reason || label('Checking…', 'در حال بررسی…')}</strong></p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={selectedLocalModelId} onChange={event => setSelectedLocalModelId(event.target.value)} disabled={localAiBusy || verifiedLocalModels.length === 0} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white">
              <option value="">{label('Select a verified downloaded GGUF model', 'انتخاب مدل GGUF تأییدشده')}</option>
              {verifiedLocalModels.map(model => <option key={model.id} value={model.id}>{model.repoId} / {model.fileName}</option>)}
            </select>
            <button type="button" className={button} disabled={localAiBusy} onClick={() => void refreshLocalAi()}>{label('Refresh', 'تازه‌سازی')}</button>
          </div>
          {!verifiedLocalModels.length && <p className="mt-2 text-xs text-amber-200">{label('No SHA-256 verified GGUF model is installed yet. Download a model in Offline AI Hub first; AFG AI will reuse that file and will not download it again.', 'هنوز مدل GGUF تأییدشده با SHA-256 نصب نشده است. ابتدا در مرکز هوش آفلاین یک مدل دانلود کنید؛ AFG AI از همان فایل استفاده می‌کند و دوباره آن را دانلود نمی‌کند.')}</p>}
          {localRuntime && !localRuntime.available && <p className="mt-2 text-xs text-amber-200">{localRuntime.reason || label('This APK does not contain the native llama.cpp runtime.', 'این APK موتور بومی llama.cpp را ندارد.')}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={button} disabled={localAiBusy || !localRuntime?.available || !selectedLocalModel || needleRuntime?.modelLoaded} onClick={() => void loadJarvisLocalModel()}>{label('Load local model', 'بارگذاری مدل محلی')}</button>
            <button type="button" className={button} disabled={localAiBusy || !loadedLocalModelId} onClick={() => void unloadJarvisLocalModel()}>{label('Unload model', 'تخلیه مدل')}</button>
          </div>
          {loadedLocalModelId && <p className="mt-2 text-xs text-emerald-300">{label('Loaded and ready: ', 'بارگذاری و آماده: ')}{loadedLocalModelId}</p>}
          <label className="mt-4 block text-xs text-slate-400">{label('Ask AFG AI in Dari, Pashto or English', 'به دری، پشتو یا انگلیسی به AFG AI فرمان بدهید')}</label>
          <textarea value={localAiPrompt} onChange={event => setLocalAiPrompt(event.target.value)} maxLength={300} rows={2} disabled={(!loadedLocalModelId && !needleLoaded) || localAiBusy} placeholder={label('e.g. Please open Telegram', 'مثلاً لطفاً تلگرام را باز کن')} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white disabled:opacity-50" />
          <button type="button" className={button + ' mt-2 w-full'} disabled={(!loadedLocalModelId && !needleLoaded) || !localAiPrompt.trim() || localAiBusy} onClick={() => void interpretWithLocalAi()}>{localAiBusy ? label('Processing on device…', 'پردازش روی گوشی…') : label('Understand command offline', 'درک فرمان به‌صورت آفلاین')}</button>
          {localAiReply && <p role="status" className="mt-3 rounded-xl bg-violet-400/10 p-3 text-sm text-violet-100">{localAiReply}</p>}
          {pendingAiCommand && <button type="button" className={button + ' mt-2 w-full'} onClick={() => { const command = pendingAiCommand; setPendingAiCommand(''); confirmLocalCommand(command); }}>{label('Review & confirm device action', 'بررسی و تأیید عملیات دستگاه')}</button>}
          {localAiError && <p role="alert" className="mt-2 text-sm text-rose-300">{localAiError}</p>}
          <p className="mt-3 text-xs leading-5 text-slate-400">{label('For older phones, AFG AI loads with a conservative 1,024-token context and two CPU threads. Model loading and response speed depend on RAM, GGUF architecture and quantization. Close other heavy apps first. GGUF models are reused from Offline AI Hub. Needle 3 is an optional one-time ~35 MB download; after that inference is local and uses no mobile data.', 'برای گوشی‌های قدیمی، AFG AI با زمینه ۱۰۲۴ توکنی و دو رشته پردازشی بارگذاری می‌شود. سرعت و امکان اجرا به RAM، معماری GGUF و کوانتایز مدل بستگی دارد. پیش از اجرا برنامه‌های سنگین دیگر را ببندید. مدل GGUF از مرکز هوش آفلاین استفاده می‌شود. Needle 3 یک‌بار حدود ۳۵ مگابایت دانلود می‌شود؛ پس از آن پردازش محلی است و اینترنت موبایل مصرف نمی‌کند.')}</p>
        </>}
      </section>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-white">{label('Permission status', 'وضعیت دسترسی')}</h2><button className={button} onClick={() => void refresh()}>{label('Refresh', 'تازه‌سازی')}</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="rounded-xl bg-white/5 p-3 text-sm">{label('Accessibility service', 'سرویس دسترس‌پذیری')}: <strong className={status?.accessibilityEnabled ? 'text-emerald-300' : 'text-amber-300'}>{status?.accessibilityEnabled ? label('Enabled','فعال') : label('Not enabled','فعال نیست')}</strong></p>
          <p className="rounded-xl bg-white/5 p-3 text-sm">{label('Service connection', 'اتصال سرویس')}: <strong className={status?.serviceConnected ? 'text-emerald-300' : 'text-amber-300'}>{status?.serviceConnected ? label('Connected','متصل') : label('Disconnected','قطع')}</strong></p>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <p className="rounded-xl bg-white/5 p-3 text-sm">{label('Speech recognition', 'تشخیص گفتار')}: <strong className={status?.speechRecognizerAvailable ? 'text-emerald-300' : 'text-amber-300'}>{status?.speechRecognizerAvailable ? label('Available','موجود') : label('Not installed','نصب نیست')}</strong></p>
          <p className="rounded-xl bg-white/5 p-3 text-sm">{label('Text-to-speech voice', 'صدای خواندن متن')}: <strong className={status?.ttsAvailable ? 'text-emerald-300' : 'text-amber-300'}>{status?.ttsAvailable ? label('Ready','آماده') : label('Not ready','آماده نیست')}</strong></p>
        </div>
        <p className="mt-2 rounded-xl bg-white/5 p-3 text-sm">{label('Microphone permission', 'دسترسی میکروفون')}: <strong className={status?.microphonePermission ? 'text-emerald-300' : 'text-amber-300'}>{status?.microphonePermission ? label('Granted','داده شده') : label('Requested only when listening starts','فقط هنگام شروع شنیدن درخواست می‌شود')}</strong></p>
        <button className={button + ' mt-3 w-full'} onClick={() => void run('settings', () => AFGJarvis.openAccessibilitySettings())}>{label('Open Accessibility settings', 'باز کردن تنظیمات دسترس‌پذیری')}</button>
        <p className="mt-3 text-xs leading-5 text-slate-400">{label('Enable “AFG AI device controls” yourself. Android displays the system consent screen. The service does not record or upload screen events.', 'گزینه «کنترل دستگاه AFG AI» را خودتان فعال کنید. اندروید صفحه تأیید سیستمی را نشان می‌دهد. این سرویس رویدادهای صفحه را ضبط یا ارسال نمی‌کند.')}</p>
      </section>
      <section className={card}>
        <h2 className="font-bold text-white">{label('Open an installed app', 'باز کردن برنامه نصب‌شده')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">{apps.map(app => <button key={app.packageName} className={button} disabled={!!busy} onClick={() => void run(app.packageName, () => AFGJarvis.openApp({ packageName: app.packageName }))}>{label(app.en, app.fa)}</button>)}</div>
        <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (packageName.trim()) void run(packageName, () => AFGJarvis.openApp({ packageName: packageName.trim() })); }}>
          <input value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="com.example.app" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white" />
          <button className={button} disabled={!!busy || !packageName.trim()}>{label('Open', 'باز کن')}</button>
        </form>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-white">{label('Local device toolkit', 'ابزارهای محلی دستگاه')}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-xs text-emerald-200">On-device</span>
            <button type="button" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-300" onClick={() => { setDeviceData({}); setClipboardInput(''); setDeviceNumber(''); setDeviceMessage(''); }}>{label('Clear results', 'پاک‌کردن نتایج')}</button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">{label('These tools run locally. Sensitive information is shown only after you tap the relevant action and grant Android permission.', 'این ابزارها محلی اجرا می‌شوند. معلومات حساس فقط پس از لمس دکمه مربوط و دادن مجوز اندروید نمایش داده می‌شود.')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button className={button} disabled={!!busy} onClick={() => void run('battery', async () => { const battery = await AFGJarvis.getBatteryStatus(); setDeviceData(v => ({...v,battery})); })}>{label('Battery status', 'وضعیت باتری')}</button>
          <button className={button} disabled={!!busy} onClick={() => void run('network', async () => { const network = await AFGJarvis.getNetworkStatus(); setDeviceData(v => ({...v,network})); })}>{label('Network status', 'وضعیت شبکه')}</button>
          <button className={button} disabled={!!busy} onClick={() => void run('sensors', async () => { const sensors = await AFGJarvis.getSensors(); setDeviceData(v => ({...v,sensors})); })}>{label('Sensors & biometrics', 'حسگرها و بایومتریک')}</button>
          <button className={button} disabled={!!busy} onClick={() => void run('vibrate', () => AFGJarvis.vibrate({durationMs:500}))}>{label('Vibrate 0.5 sec', 'لرزش نیم ثانیه')}</button>
          <button className={button} disabled={!!busy} onClick={() => { if (window.confirm(label('Toggle the camera flashlight?', 'چراغ‌قوه دوربین تغییر کند؟'))) void run('torch', async () => { await AFGJarvis.requestCameraPermission(); const next=!torchEnabled; await AFGJarvis.setTorch({enabled:next}); setTorchEnabled(next); }); }}>{torchEnabled ? label('Turn flashlight off','خاموش کردن چراغ‌قوه') : label('Turn flashlight on','روشن کردن چراغ‌قوه')}</button>
          <button className={button} disabled={!!busy} onClick={() => { if (window.confirm(label('Open the camera? You will take the photo yourself.', 'دوربین باز شود؟ عکس را خودتان می‌گیرید.'))) void run('camera', async () => { const photo = await AFGJarvis.takePhoto(); setDeviceData(v => ({...v,photo})); }); }}>{label('Take a photo', 'گرفتن عکس')}</button>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <h3 className="text-sm font-semibold text-white">{label('Location', 'موقعیت مکانی')}</h3>
          <button className={button + ' mt-2 w-full'} disabled={!!busy} onClick={() => { if (window.confirm(label('Allow AFG AI to read your current cached location?', 'اجازه می‌دهید AFG AI موقعیت ذخیره‌شده فعلی را بخواند؟'))) void run('location', async () => { await AFGJarvis.requestLocationPermission(); const location = await AFGJarvis.getLocation(); setDeviceData(v => ({...v,location})); }); }}>{label('Read current location', 'خواندن موقعیت فعلی')}</button>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <h3 className="text-sm font-semibold text-white">{label('Contacts & recent SMS', 'مخاطبین و پیامک‌های اخیر')}</h3>
          <p className="mt-1 text-xs text-slate-400">{label('Android will ask for permission. Data stays in this screen and is not uploaded by this plugin.', 'اندروید مجوز می‌خواهد. معلومات در همین صفحه می‌ماند و توسط این افزونه آپلود نمی‌شود.')}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={button} disabled={!!busy} onClick={() => { if (window.confirm(label('Read up to 20 contacts?', 'تا ۲۰ مخاطب خوانده شود؟'))) void run('contacts', async () => { await AFGJarvis.requestContactsPermission(); const contacts = await AFGJarvis.getContacts({limit:20}); setDeviceData(v => ({...v,contacts})); }); }}>{label('Read contacts', 'خواندن مخاطبین')}</button>
            <button className={button} disabled={!!busy} onClick={() => { if (window.confirm(label('Read your 5 most recent SMS messages?', 'پنج پیامک اخیر شما خوانده شود؟'))) void run('sms', async () => { await AFGJarvis.requestSmsReadPermission(); const sms = await AFGJarvis.getRecentSms({limit:5}); setDeviceData(v => ({...v,sms})); }); }}>{label('Read last 5 SMS', 'خواندن ۵ پیامک اخیر')}</button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <h3 className="text-sm font-semibold text-white">{label('Clipboard', 'کلیپ‌بورد')}</h3>
          <textarea value={clipboardInput} onChange={e => setClipboardInput(e.target.value)} maxLength={4000} rows={2} placeholder={label('Text to copy', 'متن برای کاپی')} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={button} disabled={!!busy} onClick={() => void run('clipboard-set', () => AFGJarvis.setClipboard({text:clipboardInput}))}>{label('Copy text', 'کاپی متن')}</button>
            <button className={button} disabled={!!busy} onClick={() => void run('clipboard-get', async () => { const value=await AFGJarvis.getClipboard(); setClipboardInput(value.text); })}>{label('Read clipboard', 'خواندن کلیپ‌بورد')}</button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <h3 className="text-sm font-semibold text-white">{label('Phone actions', 'عملیات تلفن')}</h3>
          <input value={deviceNumber} onChange={e => setDeviceNumber(e.target.value)} maxLength={40} placeholder={label('Phone number', 'شماره تلفن')} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white" />
          <textarea value={deviceMessage} onChange={e => setDeviceMessage(e.target.value)} maxLength={1000} rows={2} placeholder={label('SMS message (optional)', 'متن پیامک (اختیاری)')} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={button} disabled={!!busy || !deviceNumber.trim()} onClick={() => { if (window.confirm(label('Open the dialer with this number? No call will be placed automatically.', 'شماره در شماره‌گیر باز شود؟ تماس خودکار برقرار نمی‌شود.'))) void run('dial', () => AFGJarvis.openDialer({number:deviceNumber.trim()})); }}>{label('Open dialer', 'باز کردن شماره‌گیر')}</button>
            <button className={button} disabled={!!busy || !deviceNumber.trim()} onClick={() => { if (window.confirm(label('Open the SMS composer? You must press Send yourself.', 'برنامه پیامک باز شود؟ ارسال را خودتان باید بزنید.'))) void run('sms-compose', () => AFGJarvis.openSmsComposer({number:deviceNumber.trim(),body:deviceMessage})); }}>{label('Compose SMS', 'نوشتن پیامک')}</button>
          </div>
        </div>
        {deviceData.battery && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-slate-200">{label('Battery','باتری')}: {deviceData.battery.levelPercent >= 0 ? deviceData.battery.levelPercent + '%' : label('Unknown','نامشخص')} · {deviceData.battery.charging ? label('Charging','در حال شارژ') : label('Not charging','بدون شارژ')} · {deviceData.battery.temperatureC ?? '—'}°C</p>}
        {deviceData.network && <p className="mt-2 rounded-xl bg-white/5 p-3 text-sm text-slate-200">{label('Network','شبکه')}: {deviceData.network.transport} · {deviceData.network.connected ? label('Internet available','اینترنت شناسایی شد') : label('No internet capability','اینترنت موجود نیست')} · {deviceData.network.validated ? label('Validated','تأییدشده') : label('Not validated','تأیید نشده')}</p>}
        {deviceData.location && <p className="mt-2 break-all rounded-xl bg-white/5 p-3 text-sm text-slate-200">{label('Cached location','موقعیت ذخیره‌شده')}: {deviceData.location.latitude}, {deviceData.location.longitude} (±{Math.round(deviceData.location.accuracyMeters || 0)}m) · {deviceData.location.source} · {new Date(deviceData.location.timestamp).toLocaleString()}</p>}
        {deviceData.sensors && <div className="mt-2 rounded-xl bg-white/5 p-3 text-xs text-slate-200"><p>{label('Sensors detected','حسگرهای شناسایی‌شده')}: {deviceData.sensors.sensors.length} · {label('Fingerprint hardware','سخت‌افزار اثر انگشت')}: {deviceData.sensors.fingerprintOrBiometricAvailable ? label('Available','موجود') : label('Not detected','شناسایی نشد')} · {label('Fingerprint data is never accessible','داده اثر انگشت قابل دسترسی نیست')}</p><p className="mt-2">{deviceData.sensors.sensors.slice(0,12).map((x:any)=>x.name).join(' · ')}</p></div>}
        {deviceData.contacts && <div className="mt-2 max-h-48 overflow-auto rounded-xl bg-white/5 p-3 text-xs text-slate-200">{deviceData.contacts.contacts.map((x:any,i:number)=><p key={i}>{x.name || '—'} · {x.phone || '—'}</p>)}</div>}
        {deviceData.sms && <div className="mt-2 max-h-60 overflow-auto rounded-xl bg-white/5 p-3 text-xs text-slate-200">{deviceData.sms.messages.map((x:any,i:number)=><div key={i} className="border-b border-white/10 py-2"><p className="font-semibold">{x.address} · {x.type}</p><p className="mt-1 whitespace-pre-wrap">{x.body}</p><p className="mt-1 text-slate-500">{new Date(x.date).toLocaleString()}</p></div>)}</div>}
        {deviceData.photo && <img alt="Camera preview" className="mt-3 max-h-72 w-full rounded-xl object-contain" src={'data:image/jpeg;base64,' + deviceData.photo.dataBase64} />}
        <p className="mt-3 text-xs leading-5 text-amber-200/80">{label('Privacy limits: SMS and contacts permissions may be restricted by Google Play policy. Camera capture opens the system camera and returns only its preview. Calls and SMS are never sent automatically. Fingerprint templates are inaccessible to apps.', 'محدودیت حریم خصوصی: مجوز پیامک و مخاطبین ممکن است طبق پالیسی Google Play محدود باشد. دوربین سیستمی باز می‌شود و فقط پیش‌نمایش را برمی‌گرداند. تماس و پیامک خودکار ارسال نمی‌شود. قالب اثر انگشت برای برنامه‌ها قابل دسترسی نیست.')}</p>
      </section>
      <section className={card}>
        <h2 className="font-bold text-white">{label('Device navigation', 'پیمایش دستگاه')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{actions.map(item => <button key={item.id} className={button} disabled={!!busy || !status?.serviceConnected} onClick={() => { if (window.confirm(label('Run this device action now?', 'این فرمان اکنون اجرا شود؟'))) void run(item.id, () => AFGJarvis.performAction({ action: item.id })); }}>{label(item.en, item.fa)}</button>)}</div>
      </section>
      <section className={card}>
        <h2 className="font-bold text-white">{label('Guided screen interaction', 'تعامل هدایت‌شده با صفحه')}</h2>
        <label className="mt-3 block text-xs text-slate-400">{label('Visible button or control text', 'متن دکمه یا کنترل قابل مشاهده')}</label>
        <div className="mt-1 flex gap-2"><input value={targetText} onChange={e => setTargetText(e.target.value)} maxLength={120} placeholder={label('e.g. Search', 'مثلاً جستجو')} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white" /><button className={button} disabled={!!busy || !status?.serviceConnected || !targetText.trim()} onClick={() => { if (window.confirm(label('Click the matching visible control?', 'کنترل قابل مشاهده با این متن کلیک شود؟'))) void run('click', () => AFGJarvis.clickText({ text: targetText.trim() })); }}>{label('Find & click', 'یافتن و کلیک')}</button></div>
        <label className="mt-4 block text-xs text-slate-400">{label('Text to enter into the currently focused field', 'متن برای نوشتن در کادر فعال')}</label>
        <textarea value={typedText} onChange={e => setTypedText(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white" placeholder={label('Enter text…', 'متن را بنویسید…')} />
        <button className={button + ' mt-2 w-full'} disabled={!!busy || !status?.serviceConnected || !typedText.trim()} onClick={() => { if (window.confirm(label('Insert this text into the currently focused field?', 'این متن در کادر فعال وارد شود؟'))) void run('type', () => AFGJarvis.typeText({ text: typedText })); }}>{label('Type into focused field', 'نوشتن در کادر فعال')}</button>
        <p className="mt-3 text-xs leading-5 text-slate-400">{label('This does not auto-like, subscribe, purchase, install apps or send messages. You remain in control and confirm each action. Some apps hide controls from accessibility services.', 'این نسخه به‌صورت خودکار لایک، اشتراک، خرید، نصب برنامه یا ارسال پیام انجام نمی‌دهد. کنترل و تأیید هر عملیات با شماست. بعضی برنامه‌ها کنترل‌های خود را از سرویس دسترس‌پذیری پنهان می‌کنند.')}</p>
      </section>
    </>}
    {(notice || error) && <p role={error ? 'alert' : 'status'} className={error ? 'rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200' : 'rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200'}>{error || notice}</p>}
    {busy && <p className="text-center text-xs text-cyan-300">{label('Working…', 'در حال اجرا…')}</p>}
  </main>;
}
