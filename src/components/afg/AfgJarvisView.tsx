import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AFGJarvis, type JarvisStatus, type JarvisAction, type JarvisSpeechEvent, type JarvisSpeechLanguage } from '@afg-ai/capacitor-jarvis';
import type { Language } from '../../types/afg';

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
  const native = Capacitor.isNativePlatform();
  const [status, setStatus] = useState<JarvisStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [packageName, setPackageName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [typedText, setTypedText] = useState('');
  const [speechState, setSpeechState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [speechError, setSpeechError] = useState('');
  const label = (en: string, fa: string) => dari ? fa : en;
  const card = 'rounded-2xl border border-cyan-400/20 bg-slate-950/50 p-4 shadow-[0_0_28px_rgba(6,182,212,.06)]';
  const button = 'rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40';
  const refresh = useCallback(async () => {
    if (!native) return;
    try { setStatus(await AFGJarvis.getStatus()); setError(''); }
    catch (e: any) { setError(e?.message || 'Could not read Android service status.'); }
  }, [native]);
  useEffect(() => { void refresh(); }, [refresh]);
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
    return () => { active = false; if (handle) void handle.remove(); };
  }, [native]);
  async function run(key: string, task: () => Promise<unknown>) {
    setBusy(key); setError(''); setNotice('');
    try { await task(); setNotice(label('Command sent to Android.', 'فرمان به اندروید فرستاده شد.')); await refresh(); }
    catch (e: any) { setError(e?.message || label('Command failed.', 'اجرای فرمان ناموفق بود.')); }
    finally { setBusy(''); }
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6" dir={dari ? 'rtl' : 'ltr'}>
    <header className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 sm:p-7">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/40 bg-cyan-300/10 text-3xl text-cyan-200">◉</div>
        <div><p className="text-xs font-bold tracking-[.25em] text-cyan-300">AFG AI / JARVIS</p><h1 className="mt-1 text-2xl font-black text-white">{label('Device assistant', 'دستیار دستگاه')}</h1><p className="mt-1 text-sm text-slate-300">{label('Local Android controls with your explicit approval.', 'کنترل محلی اندروید با تأیید مستقیم شما.')}</p></div></div>
    </header>
    {!native && <section className={card}><p className="font-semibold text-amber-300">{label('Android app required', 'نسخه اندروید لازم است')}</p><p className="mt-2 text-sm text-slate-300">{label('Device-control features are available only in the installed AFG AI Android app, not in a browser tab.', 'قابلیت‌های کنترل دستگاه فقط در نسخه نصب‌شده اندروید AFG AI فعال‌اند، نه در مرورگر.')}</p></section>}
    {native && <>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-white">{label('Voice control', 'کنترل صوتی')}</h2><span className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-200">{speechState}</span></div>
        <p className="mt-2 text-xs leading-5 text-slate-400">{label('Android speech recognition is requested with its offline preference. The recognition provider may ignore it or require network access; offline operation is not guaranteed. Install the required language pack in Android voice settings.', 'تشخیص گفتار اندروید با درخواست اولویت آفلاین اجرا می‌شود؛ اما سرویس تشخیص ممکن است این درخواست را نادیده بگیرد یا به اینترنت نیاز داشته باشد. آفلاین بودن تضمین‌شده نیست. بسته زبان را در تنظیمات صوتی اندروید نصب کنید.')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={button} disabled={!!busy || !status?.speechRecognizerAvailable} onClick={() => void run('listen', async () => { await AFGJarvis.requestMicrophonePermission(); setSpeechError(''); setTranscript(''); await AFGJarvis.startListening({ language: (dari ? 'fa-IR' : language === 'pashto' ? 'ps-AF' : language === 'arabic' ? 'ar' : 'en-US') as JarvisSpeechLanguage }); })}>{label('Start listening', 'شروع شنیدن')}</button>
          <button className={button} disabled={!!busy} onClick={() => void run('stop', () => AFGJarvis.stopListening())}>{label('Stop', 'توقف')}</button>
        </div>
        {transcript && <p className="mt-3 rounded-xl bg-black/30 p-3 text-sm text-white">{transcript}</p>}
        {speechError && <p role="alert" className="mt-2 text-sm text-rose-300">{speechError}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className={button} disabled={!transcript.trim() || !!busy} onClick={() => {
            const command = transcript.trim().toLowerCase();
            const app = apps.find(item => command === item.en.toLowerCase() || command === ('open ' + item.en.toLowerCase()) || (dari && command === item.fa));
            const action = command === 'back' || command === 'go back' || command === 'بازگشت' ? 'back'
              : command === 'home' || command === 'go home' || command === 'صفحه اصلی' ? 'home'
              : command === 'notifications' || command === 'اعلان‌ها' ? 'notifications'
              : command === 'quick settings' || command === 'تنظیمات سریع' ? 'quickSettings' : null;
            if (app) { if (window.confirm(label('Open ' + app.en + '?', 'برنامه ' + app.fa + ' باز شود؟'))) void run('voice-app', () => AFGJarvis.openApp({ packageName: app.packageName })); }
            else if (action) { if (window.confirm(label('Run ' + action + '?', 'فرمان اجرا شود؟'))) void run('voice-action', () => AFGJarvis.performAction({ action })); }
            else setSpeechError(label('No matching safe command. Try “open Telegram”, “back”, or “home”.', 'فرمان امن شناخته نشد. «بازگشت»، «صفحه اصلی» یا نام برنامه را بگویید.'));
          }}>{label('Confirm voice command', 'تأیید فرمان صوتی')}</button>
          <button className={button} disabled={!transcript.trim() || !!busy} onClick={() => void run('speak', () => AFGJarvis.speak({ text: transcript, language: (dari ? 'fa-IR' : language === 'pashto' ? 'ps-AF' : language === 'arabic' ? 'ar' : 'en-US') as JarvisSpeechLanguage }))}>{label('Speak transcript', 'خواندن متن با صدا')}</button>
        </div>
        <p className="mt-3 text-xs text-slate-400">{label('Only listed app-launch and navigation phrases are mapped to actions, and every action requires your confirmation. Unknown speech is never executed as a command.', 'فقط عبارت‌های مشخص‌شده برای بازکردن برنامه و پیمایش به فرمان تبدیل می‌شوند و هر فرمان نیازمند تأیید شماست. گفتار ناشناخته هرگز خودکار اجرا نمی‌شود.')}</p>
      </section>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-white">{label('Permission status', 'وضعیت دسترسی')}</h2><button className={button} onClick={() => void refresh()}>{label('Refresh', 'تازه‌سازی')}</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="rounded-xl bg-white/5 p-3 text-sm">{label('Accessibility service', 'سرویس دسترس‌پذیری')}: <strong className={status?.accessibilityEnabled ? 'text-emerald-300' : 'text-amber-300'}>{status?.accessibilityEnabled ? label('Enabled','فعال') : label('Not enabled','فعال نیست')}</strong></p>
          <p className="rounded-xl bg-white/5 p-3 text-sm">{label('Service connection', 'اتصال سرویس')}: <strong className={status?.serviceConnected ? 'text-emerald-300' : 'text-amber-300'}>{status?.serviceConnected ? label('Connected','متصل') : label('Disconnected','قطع')}</strong></p>
        </div>
        <button className={button + ' mt-3 w-full'} onClick={() => void run('settings', () => AFGJarvis.openAccessibilitySettings())}>{label('Open Accessibility settings', 'باز کردن تنظیمات دسترس‌پذیری')}</button>
        <p className="mt-3 text-xs leading-5 text-slate-400">{label('Enable “AFG AI Jarvis device controls” yourself. Android displays the system consent screen. The service does not record or upload screen events.', 'گزینه «کنترل دستگاه AFG AI Jarvis» را خودتان فعال کنید. اندروید صفحه تأیید سیستمی را نشان می‌دهد. این سرویس رویدادهای صفحه را ضبط یا ارسال نمی‌کند.')}</p>
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
