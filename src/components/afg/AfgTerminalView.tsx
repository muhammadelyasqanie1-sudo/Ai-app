import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import type { Language } from '../../types/afg';

export function AfgTerminalView({ language }: { language: Language }) {
  const dari = language === 'dari';
  const [session, setSession] = useState('');
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('AFG Terminal — read-only mode');
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const csrf = () => {
    const value = document.cookie.split('; ').find(x => x.startsWith('afg_csrf='))?.slice(9) || '';
    try { return decodeURIComponent(value); } catch { return value; }
  };
  useEffect(() => {
    let alive = true;
    apiFetch('/api/terminal/sessions').then(r => r.json()).then(async data => {
      if (!alive) return;
      if (data.sessions?.[0]) setSession(data.sessions[0].id);
      else {
        const created = await apiFetch('/api/terminal/sessions', { method: 'POST', headers: { 'X-CSRF-Token': csrf() }, body: JSON.stringify({ surface: 'web' }) });
        const value = await created.json();
        if (alive) setSession(value.session.id);
      }
    }).catch(() => setError(dari ? 'برای استفاده از ترمینل وارد حساب شوید.' : 'Sign in to use Terminal.'));
    return () => { alive = false; };
  }, [dari]);
  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !command.trim() || busy) return;
    setBusy(true);
    try {
      const response = await apiFetch('/api/terminal/sessions/' + session + '/commands', {
        method: 'POST', headers: { 'X-CSRF-Token': csrf() }, body: JSON.stringify({ command: command.trim() })
      });
      const data = await response.json();
      setOutput(data.output || '');
      setRequestId(data.requestId || '');
      setError('');
    } catch (e: any) { setOutput(e?.message || 'Command failed.'); setError(dari ? 'فرمان اجرا نشد.' : 'Command failed.'); }
    finally { setBusy(false); setCommand(''); }
  }
  return <main className="mx-auto max-w-5xl p-5">
    <h1 className="text-2xl font-bold">{dari ? 'ترمینل AFG' : 'AFG Terminal'}</h1>
    <p className="my-2 text-sm opacity-70">{dari ? 'فرمان‌های داخلی فقط‌خواندنی؛ اجرای شِل خاموش است.' : 'Read-only native commands; shell execution is disabled.'}</p>
    <div role="status" className="my-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      {dari ? 'دسترسی terminal.read فعال است. اجرای فرمان سیستم و شِل غیرفعال است.' : 'terminal.read is available. System and shell execution are disabled.'}
    </div>
    <section className="rounded-xl border border-slate-500/30 bg-slate-950 p-4 text-slate-100">
      <pre className="min-h-64 whitespace-pre-wrap break-words font-mono text-sm" aria-live="polite">{output}</pre>
      <form onSubmit={run} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="afg-term-command">Command</label>
        <input id="afg-term-command" value={command} onChange={e => setCommand(e.target.value)} placeholder="afg models list" className="min-w-0 flex-1 rounded-lg bg-white/10 p-3 font-mono" />
        <button disabled={!session || busy} className="rounded-lg bg-cyan-600 px-4 py-2 disabled:opacity-40">{busy ? '…' : (dari ? 'اجرا' : 'Run')}</button>
      </form>
    </section>
    <p className="mt-3 text-xs opacity-60">afg help · afg version · afg models list · afg conv list · afg files list</p>
    {requestId && <p className="mt-2 text-xs">Request ID: {requestId}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
  </main>;
}
