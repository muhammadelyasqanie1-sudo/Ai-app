import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, getCsrfToken } from '../../lib/apiClient';
import type { Language } from '../../types/afg';
import { AfgJarvisVisualCore } from './AfgJarvisVisualCore';

type Turn = { role: 'user' | 'assistant'; content: string };
type ModelItem = { id?: string; name?: string };

export function AfgOpenJarvisPanel({ language }: { language: Language }) {
  const locale = language === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english';
  const rtl = ['dari','pashto','persian','arabic','urdu'].includes(language);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const status = await apiFetch('/api/openjarvis/status');
      const data = await status.json();
      setConnected(data.connected === true);
      if (data.connected === true) {
        const response = await apiFetch('/api/openjarvis/models');
        const catalog = await response.json();
        const items = Array.isArray(catalog.data) ? catalog.data : [];
        const ids = items.map((item: ModelItem) => String(item.id || item.name || '')).filter(Boolean);
        setModels(ids);
        setModel(current => ids.includes(current) ? current : ids[0] || '');
      }
      setError('');
    } catch (e) {
      setConnected(false);
      setError(e instanceof Error ? e.message : 'OpenJarvis is unavailable.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function send() {
    const content = input.trim();
    if (!content || busy || !connected || !model) return;
    setInput('');
    setError('');
    const next = [...turns, { role: 'user' as const, content }, { role: 'assistant' as const, content: '' }];
    setTurns(next);
    setBusy(true);
    try {
      const response = await apiFetch('/api/openjarvis/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({
          model,
          messages: next.slice(0, -1).map(turn => ({ role: turn.role, content: turn.content })),
          stream: true,
        }),
      });
      if (!response.body) throw new Error('OpenJarvis returned no response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const event of events) {
            const line = event.split('\n').find(item => item.startsWith('data:'));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const packet = JSON.parse(raw);
              const piece = packet.choices?.[0]?.delta?.content;
              if (typeof piece === 'string' && piece) {
                answer += piece;
                setTurns(current => current.map((turn, index) => index === current.length - 1 ? { ...turn, content: answer } : turn));
              }
            } catch { /* Ignore non-JSON SSE comments and keep reading. */ }
          }
        }
      } finally { reader.releaseLock(); }
      if (!answer.trim()) throw new Error('OpenJarvis returned an empty answer.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OpenJarvis request failed.');
      setTurns(current => current.filter((turn, index) => !(index === current.length - 1 && turn.role === 'assistant' && !turn.content)));
    } finally { setBusy(false); }
  }

  const ps:Record<string,string>={'Intelligence engine':'د ځیرکتیا انجن','Full upstream source imported; runtime connects through your AFG AI account.':'د اصلي پروژې بشپړه سرچینه وارد شوې؛ انجن ستاسو د AFG AI حساب له لارې نښلېږي.','Checking…':'حالت کتل کېږي…','Connected':'وصل دی','Not connected':'نه دی وصل','OpenJarvis model':'د OpenJarvis ماډل','Your OpenJarvis conversations will appear here.':'ستاسو د OpenJarvis خبرې به دلته ښکاره شي.','Ask OpenJarvis…':'له OpenJarvis څخه وپوښتئ…','Send':'لېږل','The private OpenJarvis runtime must be deployed and configured on the server.':'د OpenJarvis شخصي انجن باید پر سرور خپور او تنظیم شي.','Retry connection':'بیا نښلېدل'};
  const ar:Record<string,string>={'Intelligence engine':'محرك الذكاء','Full upstream source imported; runtime connects through your AFG AI account.':'تم استيراد المصدر الأصلي بالكامل؛ يتصل محرك التشغيل عبر حساب AFG AI.','Checking…':'جارٍ التحقق…','Connected':'متصل','Not connected':'غير متصل','OpenJarvis model':'نموذج OpenJarvis','Your OpenJarvis conversations will appear here.':'ستظهر محادثات OpenJarvis هنا.','Ask OpenJarvis…':'اسأل OpenJarvis…','Send':'إرسال','The private OpenJarvis runtime must be deployed and configured on the server.':'يجب نشر محرك OpenJarvis الخاص وإعداده على الخادم.','Retry connection':'إعادة الاتصال'};
  const text = (en: string, fa: string) => locale === 'dari' ? fa : locale === 'pashto' ? (ps[en] || en) : locale === 'arabic' ? (ar[en] || en) : en;
  return <>
    <AfgJarvisVisualCore active={busy} connected={connected} language={language} />
    <section dir={rtl?'rtl':'ltr'} className="rounded-2xl border border-violet-400/25 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(124,77,255,.08)]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-bold text-white">OpenJarvis · {text('Intelligence engine', 'موتور هوشمند')}</h2>
        <p className="mt-1 text-xs text-slate-400">{text('Full upstream source imported; runtime connects through your AFG AI account.', 'منبع کامل پروژه وارد شده؛ ارتباط با موتور از حساب AFG AI انجام می‌شود.')}</p>
      </div>
      <span className={connected ? 'rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300' : 'rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200'}>
        {checking ? text('Checking…', 'در حال بررسی…') : connected ? text('Connected', 'متصل') : text('Not connected', 'متصل نیست')}
      </span>
    </div>
    {connected && <div className="mt-3">
      <label className="mb-1 block text-xs text-slate-400">{text('OpenJarvis model', 'مدل OpenJarvis')}</label>
      <select value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white">
        {models.map(id => <option key={id} value={id}>{id}</option>)}
      </select>
    </div>}
    <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-xl bg-black/20 p-3">
      {turns.length === 0 && <p className="text-sm text-slate-500">{text('Your OpenJarvis conversations will appear here.', 'گفتگوهای OpenJarvis در اینجا نمایش داده می‌شوند.')}</p>}
      {turns.map((turn, index) => <div key={index} className={turn.role === 'user' ? 'ml-5 rounded-xl bg-cyan-400/10 p-3 text-sm text-cyan-50' : 'mr-5 whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm leading-6 text-slate-100'}>{turn.content || (busy && index === turns.length - 1 ? '…' : '')}</div>)}
    </div>
    <div className="mt-3 flex gap-2">
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} maxLength={32000} disabled={!connected || busy} placeholder={text('Ask OpenJarvis…', 'از OpenJarvis بپرسید…')} className="min-w-0 flex-1 resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white disabled:opacity-50" />
      <button type="button" onClick={() => void send()} disabled={!connected || !model || busy || !input.trim()} className="rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? '…' : text('Send', 'ارسال')}</button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-400/10 p-2 text-xs text-rose-200">{error}</p>}
    {!connected && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-400">{text('The private OpenJarvis runtime must be deployed and configured on the server.', 'موتور خصوصی OpenJarvis باید روی سرور راه‌اندازی و تنظیم شود.')}</p>
      <button type="button" onClick={() => void refresh()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">{text('Retry connection', 'تلاش دوباره')}</button>
    </div>}
    </section>
  </>;
}
