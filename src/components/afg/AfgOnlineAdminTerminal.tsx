import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, CircleAlert, CircleCheck, Clock3, Loader2, Play, RefreshCw, Server, TerminalSquare } from 'lucide-react';
import type { Language } from '../../types/afg';

type GatewayJob = {
  id: string;
  request_id: string;
  model: string;
  status: 'queued'|'running'|'completed'|'failed'|'cancelled';
  provider_id?: string|null;
  model_id?: string|null;
  error_code?: string|null;
  output_text?: string|null;
  created_at: string;
  started_at?: string|null;
  completed_at?: string|null;
};
type Worker = { worker_id:string; hostname:string; version:string; last_seen_at:string; online:boolean };
const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

function csrfToken() {
  const item = document.cookie.split('; ').find(value => value.startsWith('afg_csrf='));
  return item ? decodeURIComponent(item.slice('afg_csrf='.length)) : '';
}
async function gatewayApi(path:string, options:RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type','application/json');
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-CSRF-Token',csrfToken());
  const response = await fetch(API + path,{...options,headers,credentials:'include',cache:'no-store'});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.error || 'Gateway request failed.');
  return body;
}

export const AfgOnlineAdminTerminal: React.FC<{language:Language}> = ({language}) => {
  const dari = language === 'dari';
  const [workers,setWorkers] = useState<Worker[]>([]);
  const [counts,setCounts] = useState<Record<string,number>>({});
  const [jobs,setJobs] = useState<GatewayJob[]>([]);
  const [selected,setSelected] = useState<GatewayJob|null>(null);
  const [model,setModel] = useState('auto');
  const [prompt,setPrompt] = useState('');
  const [loading,setLoading] = useState(false);
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const refresh = useCallback(async() => {
    setLoading(true);
    try {
      const [status,history] = await Promise.all([
        gatewayApi('/api/admin/terminal-gateway/status'),
        gatewayApi('/api/admin/terminal-gateway/jobs'),
      ]);
      setWorkers(Array.isArray(status.workers) ? status.workers : []);
      setCounts(Object.fromEntries((status.jobs || []).map((row:any)=>[row.status,Number(row.count)||0])));
      setJobs(Array.isArray(history.jobs) ? history.jobs : []);
      setError('');
      if (selected?.id) {
        const latest = await gatewayApi('/api/admin/terminal-gateway/jobs/'+encodeURIComponent(selected.id));
        setSelected(latest.job || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load gateway status.');
    } finally { setLoading(false); }
  },[selected?.id]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); },8000);
    return () => window.clearInterval(timer);
  },[refresh]);

  const openJob = async(job:GatewayJob) => {
    setSelected(job);
    try {
      const result = await gatewayApi('/api/admin/terminal-gateway/jobs/'+encodeURIComponent(job.id));
      setSelected(result.job || job);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load job details.'); }
  };

  const submit = async(event:React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || sending) return;
    setSending(true);setError('');setNotice('');
    try {
      const result = await gatewayApi('/api/admin/terminal-gateway/jobs',{
        method:'POST',
        body:JSON.stringify({model:model.trim() || 'auto',messages:[{role:'user',content:prompt.trim()}]}),
      });
      setPrompt('');
      setNotice(dari ? 'درخواست در صف پردازش قرار گرفت.' : 'Request added to the gateway queue.');
      if (result.job) setSelected(result.job);
      await refresh();
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Could not submit this request.');
    } finally { setSending(false); }
  };

  const online = workers.some(worker=>worker.online);
  const panel = 'rounded-2xl border border-slate-800 bg-slate-950/75 p-4 shadow-lg shadow-black/10';
  const field = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/60 disabled:opacity-40';
  const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40';
  const date = (value?:string|null) => value ? new Intl.DateTimeFormat(dari?'fa-AF':'en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
  const statusLabel = (value:string) => dari ? ({queued:'در صف',running:'در حال اجرا',completed:'تکمیل‌شده',failed:'ناموفق',cancelled:'لغوشده'} as any)[value] || value : value;
  const statusClass = (value:string) => value==='completed'?'text-emerald-300':value==='failed'?'text-rose-300':value==='running'?'text-cyan-300':'text-amber-200';

  return <section className="space-y-4" dir={dari?'rtl':'ltr'}>
    <div className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"><TerminalSquare size={21}/></div>
          <div><h2 className="text-lg font-black text-white">{dari?'ترمینال مدیر آنلاین':'Online Admin Terminal'}</h2><p className="mt-1 text-xs text-slate-400">{dari?'دروازهٔ پردازش درخواست‌های هوش مصنوعی روی سرور':'Server-side AI job gateway and worker monitor'}</p></div>
        </div>
        <button className={secondary} onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14} className={loading?'animate-spin':''}/>{dari?'به‌روزرسانی':'Refresh'}</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Server size={14}/>{dari?'وضعیت سرویس Worker':'Worker service'}</div>
          <div className={'mt-2 flex items-center gap-2 text-sm font-bold '+(online?'text-emerald-300':'text-amber-200')}>
            <span className={'h-2 w-2 rounded-full '+(online?'bg-emerald-400':'bg-amber-400')}/>{online?(dari?'آنلاین':'Online'):(dari?'آفلاین یا هنوز راه‌اندازی نشده':'Offline or not deployed')}
          </div>
          {workers[0]&&<p className="mt-1 text-[10px] text-slate-500">{workers[0].hostname} · {dari?'آخرین اتصال':'Last heartbeat'}: {date(workers[0].last_seen_at)}</p>}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Activity size={14}/>{dari?'آمار صف در ۲۴ ساعت':'Queue totals · 24h'}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-200">
            {['queued','running','completed','failed'].map(key=><span key={key}><b>{counts[key]||0}</b> {statusLabel(key)}</span>)}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">{dari?'این ابزار درخواست‌های AI را به Worker می‌فرستد؛ ترمینال شِل لینوکس نیست و فرمان‌های سیستم‌عامل را اجرا نمی‌کند.':'This submits AI jobs to the server worker. It is not a Linux shell and does not execute operating-system commands.'}</p>
    </div>

    <form className={panel+' space-y-3'} onSubmit={submit}>
      <div className="flex items-center gap-2 text-sm font-bold text-white"><Bot size={17} className="text-cyan-300"/>{dari?'درخواست آزمایشی مدیر':'Submit an admin AI request'}</div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_2fr]">
        <label className="space-y-1 text-[11px] text-slate-400"><span>{dari?'شناسه مدل':'Model ID'}</span><input className={field} value={model} onChange={e=>setModel(e.target.value)} maxLength={300} placeholder="auto"/></label>
        <label className="space-y-1 text-[11px] text-slate-400"><span>{dari?'متن درخواست':'Prompt'}</span><textarea className={field+' min-h-24 resize-y'} value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={20000} required placeholder={dari?'درخواست خود را بنویسید...':'Write a request for the configured AI provider...'}/></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{dari?'حداکثر ۲۰٬۰۰۰ نویسه؛ فقط مدل‌های تنظیم و تأییدشده در سمت سرور.':'Up to 20,000 characters; only server-configured and verified providers are used.'}</span><button className={primary} type="submit" disabled={sending||!prompt.trim()}>{sending?<Loader2 size={15} className="animate-spin"/>:<Play size={15}/>}{dari?'ارسال درخواست':'Submit request'}</button></div>
      {notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
      {error&&<p role="alert" className="flex items-center gap-2 text-xs text-rose-300"><CircleAlert size={14}/>{error}</p>}
    </form>

    <div className={panel}>
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">{dari?'درخواست‌های اخیر':'Recent gateway jobs'}</h3><span className="text-[10px] text-slate-500">{jobs.length} {dari?'درخواست':'jobs'}</span></div>
      <div className="space-y-2">
        {jobs.map(job=><button key={job.id} type="button" onClick={()=>void openJob(job)} className={'w-full rounded-xl border p-3 text-left transition '+(selected?.id===job.id?'border-cyan-400/40 bg-cyan-400/[0.06]':'border-slate-800 bg-slate-900/60 hover:border-slate-700')}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="max-w-[75%] truncate text-xs font-semibold text-slate-200">{job.model} · {job.request_id.slice(0,8)}</span><span className={'text-[10px] font-bold '+statusClass(job.status)}>{statusLabel(job.status)}</span></div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock3 size={11}/>{date(job.created_at)}</div>
        </button>)}
        {!jobs.length&&<p className="py-5 text-center text-xs text-slate-500">{dari?'هنوز درخواستی ثبت نشده است.':'No gateway jobs yet.'}</p>}
      </div>
    </div>

    {selected&&<div className={panel}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">{dari?'جزئیات درخواست':'Job details'}</h3><span className={'text-xs font-bold '+statusClass(selected.status)}>{statusLabel(selected.status)}</span></div>
      <div className="grid gap-2 text-[11px] text-slate-400 sm:grid-cols-2"><p>Model: <b className="text-slate-200">{selected.model_id||selected.model}</b></p><p>Provider: <b className="text-slate-200">{selected.provider_id||'—'}</b></p><p>Created: {date(selected.created_at)}</p><p>Completed: {date(selected.completed_at)}</p></div>
      {selected.error_code&&<p className="mt-3 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{selected.error_code}</p>}
      {selected.output_text&&<div className="mt-3"><div className="mb-2 flex items-center gap-2 text-xs font-bold text-cyan-200"><CircleCheck size={14}/>{dari?'پاسخ':'Response'}</div><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs leading-6 text-slate-200">{selected.output_text}</pre></div>}
      {selected.status==='queued'||selected.status==='running'?<p className="mt-3 text-xs text-amber-200">{dari?'در انتظار پردازش Worker...':'Waiting for the server worker to process this job...'}</p>:null}
    </div>}
  </section>;
};
