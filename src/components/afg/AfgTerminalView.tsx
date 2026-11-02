import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import type { Language } from '../../types/afg';

type Session = { id:string; surface:string; created_at:string; last_active_at:string };
type Audit = { command:string; output_text:string; exit_code:number; duration_ms:number; request_id:string; created_at:string };
type CliToken = { id:string; name:string; token_prefix:string; created_at:string; expires_at:string; last_used_at:string|null; revoked_at:string|null; scopes:string[] };

export function AfgTerminalView({ language }: { language: Language }) {
  const dari = language === 'dari';
  const [sessions,setSessions] = useState<Session[]>([]);
  const [session,setSession] = useState('');
  const [command,setCommand] = useState('');
  const [entries,setEntries] = useState<Audit[]>([]);
  const [history,setHistory] = useState<string[]>([]);
  const [historyIndex,setHistoryIndex] = useState(-1);
  const [search,setSearch] = useState('');
  const [requestId,setRequestId] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [tokenName,setTokenName] = useState('My CLI');
  const [tokens,setTokens] = useState<CliToken[]>([]);
  const [newToken,setNewToken] = useState('');
  const [showTokens,setShowTokens] = useState(false);

  const csrf = () => {
    const value = document.cookie.split('; ').find(x => x.startsWith('afg_csrf='))?.slice(9) || '';
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const postHeaders = () => ({ 'X-CSRF-Token': csrf(), 'Content-Type':'application/json' });

  const loadSessions = useCallback(async () => {
    const response = await apiFetch('/api/terminal/sessions');
    const data = await response.json();
    const active = (data.sessions || []) as Session[];
    setSessions(active);
    if (!session && active[0]) setSession(active[0].id);
    if (session && !active.some(item=>item.id===session)) setSession(active[0]?.id || '');
  },[session]);

  const loadAudit = useCallback(async (id:string) => {
    if (!id) return;
    const response = await apiFetch('/api/terminal/sessions/'+id+'/history');
    const data = await response.json();
    setEntries((data.history || []).reverse());
  },[]);

  const loadTokens = useCallback(async () => {
    const response = await apiFetch('/api/terminal/tokens');
    const data = await response.json();
    setTokens(data.tokens || []);
  },[]);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/terminal/sessions').then(r=>r.json()).then(data=>{
      if(!alive)return;
      const active=(data.sessions||[]) as Session[];
      setSessions(active);
      if(active[0]) setSession(active[0].id);
      else return apiFetch('/api/terminal/sessions',{method:'POST',headers:postHeaders(),body:JSON.stringify({surface:'web'})})
        .then(r=>r.json()).then(created=>{if(alive){setSession(created.session.id);setSessions([created.session]);}});
    }).then(()=>{if(alive) void loadTokens();}).catch(()=>setError(dari?'برای استفاده از ترمینل وارد حساب شوید.':'Sign in to use Terminal.'));
    return ()=>{alive=false;};
  },[dari,loadTokens]);

  useEffect(()=>{ if(session) void loadAudit(session).catch(()=>setError(dari?'بارگذاری تاریخچه ناموفق بود.':'Could not load command history.')); },[session,loadAudit,dari]);

  async function createSession() {
    setBusy(true);
    try {
      const response=await apiFetch('/api/terminal/sessions',{method:'POST',headers:postHeaders(),body:JSON.stringify({surface:'web'})});
      const data=await response.json();
      setSessions(prev=>[data.session,...prev]); setSession(data.session.id); setEntries([]);
    } catch { setError(dari?'ساخت نشست انجام نشد.':'Could not create session.'); }
    finally {setBusy(false);}
  }

  async function run(event:React.FormEvent) {
    event.preventDefault();
    const value=command.trim();
    if(!session || !value || busy)return;
    setBusy(true); setCommand(''); setError('');
    setHistory(prev=>[...prev,value]); setHistoryIndex(-1);
    try {
      const response=await apiFetch('/api/terminal/sessions/'+session+'/commands',{method:'POST',headers:postHeaders(),body:JSON.stringify({command:value})});
      const data=await response.json();
      setRequestId(data.requestId || response.headers.get('X-Request-Id') || '');
      await loadAudit(session);
    } catch (cause:any) {
      const id=cause?.requestId || '';
      setRequestId(id);
      setEntries(prev=>[...prev,{command:value,output_text:cause?.message || 'Command failed.',exit_code:1,duration_ms:0,request_id:id,created_at:new Date().toISOString()}]);
      setError(cause?.message || (dari?'فرمان اجرا نشد.':'Command failed.'));
    } finally {setBusy(false);}
  }

  async function createToken() {
    if(!tokenName.trim() || busy)return;
    setBusy(true);setError('');setNewToken('');
    try {
      const response=await apiFetch('/api/terminal/tokens',{method:'POST',headers:postHeaders(),body:JSON.stringify({name:tokenName.trim(),scopes:['terminal.read']})});
      const data=await response.json();
      setNewToken(data.token);
      await loadTokens();
    } catch (cause:any) {setError(cause?.message || 'Token creation failed.');}
    finally {setBusy(false);}
  }

  async function revokeToken(id:string) {
    if(!window.confirm(dari?'این توکن لغو شود؟':'Revoke this CLI token?'))return;
    try { await apiFetch('/api/terminal/tokens/'+id,{method:'DELETE',headers:postHeaders()}); await loadTokens(); }
    catch (cause:any) {setError(cause?.message || 'Token revocation failed.');}
  }

  const filteredEntries=useMemo(()=>entries.filter(item=>!search || (item.command+' '+item.output_text+' '+item.request_id).toLowerCase().includes(search.toLowerCase())),[entries,search]);
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);}catch{setError(dari?'کپی انجام نشد.':'Clipboard access unavailable.');}};
  const text=dari?{
    title:'ترمینل AFG',desc:'فرمان‌های داخلی فقط‌خواندنی؛ اجرای شِل خاموش است.',
    disabled:'اجرای فرمان‌های سیستم غیرفعال است. هیچ فرمانی روی سرور اصلی اجرا نمی‌شود.',
    perm:'دسترسی terminal.read فعال است؛ terminal.exec غیرفعال است.',
    newSession:'نشست جدید',run:'اجرا',placeholder:'مثلاً afg models list',search:'جستجو در تاریخچه',
    tokens:'توکن‌های CLI',tokenName:'نام توکن',createToken:'ساخت توکن',revoke:'لغو',
    tokenWarning:'این توکن فقط یک بار نمایش داده می‌شود. آن را در جای امن ذخیره کنید.',
    copy:'کپی',commands:'فرمان‌های مجاز',empty:'هنوز فرمانی ثبت نشده است.',
    req:'شناسه درخواست',sessions:'نشست‌ها',audit:'تاریخچه فرمان‌ها'
  }:{
    title:'AFG Terminal',desc:'Read-only AFG-native commands; shell execution is disabled.',
    disabled:'System command execution is off. No command runs on the application server.',
    perm:'terminal.read is available; terminal.exec is disabled.',
    newSession:'New session',run:'Run',placeholder:'e.g. afg models list',search:'Search command history',
    tokens:'CLI tokens',tokenName:'Token name',createToken:'Create token',revoke:'Revoke',
    tokenWarning:'This token is shown only once. Save it somewhere secure.',
    copy:'Copy',commands:'Allowed commands',empty:'No commands have been recorded.',
    req:'Request ID',sessions:'Sessions',audit:'Command history'
  };

  return <main className="mx-auto max-w-6xl p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{text.title}</h1><p className="mt-1 text-sm opacity-70">{text.desc}</p></div>
      <button type="button" onClick={()=>void createSession()} disabled={busy} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{text.newSession}</button>
    </header>
    <div role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>{text.perm}</strong><p className="mt-1">{text.disabled}</p></div>
    <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-500/25 p-3">
        <h2 className="mb-2 text-sm font-semibold">{text.sessions}</h2>
        {sessions.map(item=><button key={item.id} type="button" onClick={()=>setSession(item.id)} className={`mb-1 block w-full truncate rounded-lg p-2 text-left text-xs ${session===item.id?'bg-cyan-500/15 text-cyan-600':''}`}>{item.id.slice(0,8)} · {item.surface}</button>)}
      </aside>
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-500/25 bg-[#08111f] text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
          <span className="text-xs text-slate-400">{text.audit}</span>
          <input aria-label={text.search} value={search} onChange={e=>setSearch(e.target.value)} placeholder={text.search} className="w-full max-w-56 rounded-lg bg-white/10 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-cyan-500"/>
        </div>
        <div className="max-h-[48vh] min-h-64 space-y-3 overflow-y-auto p-4 font-mono text-sm" aria-live="polite">
          {!filteredEntries.length&&<p className="text-slate-400">{text.empty}<br/>{text.commands}: afg help · afg version · afg models list · afg conv list · afg files list</p>}
          {filteredEntries.map((item,index)=><article key={item.request_id || index} className="border-b border-white/10 pb-3">
            <p className="text-cyan-300">$ {item.command}</p>
            <pre className="mt-1 whitespace-pre-wrap break-words text-slate-200">{item.output_text || (item.exit_code===0?'Completed':`Exit code: ${item.exit_code}`)}</pre>
            <p className="mt-1 text-[11px] text-slate-500">{item.exit_code===0?'Exit 0':`Exit ${item.exit_code}`} · {item.duration_ms} ms</p>
            <p className="mt-1 break-all text-[11px] text-slate-500">{text.req}: {item.request_id}</p>
            {item.request_id&&<button type="button" onClick={()=>void copy(item.request_id)} className="mt-1 text-[11px] text-cyan-300 underline">{text.copy} {text.req}</button>}
          </article>)}
        </div>
        <form onSubmit={run} className="flex gap-2 border-t border-white/10 p-3">
          <label className="sr-only" htmlFor="afg-term-command">Command</label>
          <input id="afg-term-command" value={command} onChange={e=>setCommand(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowUp'){e.preventDefault();const next=Math.max(0,historyIndex<0?history.length-1:historyIndex-1);setHistoryIndex(next);setCommand(history[next]||'');}if(e.key==='ArrowDown'){e.preventDefault();const next=historyIndex+1;if(next>=history.length){setHistoryIndex(-1);setCommand('');}else{setHistoryIndex(next);setCommand(history[next]||'');}}}} placeholder={text.placeholder} disabled={!session||busy} className="min-w-0 flex-1 rounded-lg bg-white/10 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-cyan-500"/>
          <button disabled={!session||busy||!command.trim()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy?'…':text.run}</button>
        </form>
      </section>
    </div>
    <section className="mt-5 rounded-xl border border-slate-500/25 p-4">
      <button type="button" onClick={()=>setShowTokens(value=>!value)} className="font-semibold">{text.tokens} {showTokens?'−':'+'}</button>
      {showTokens&&<div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2"><input value={tokenName} onChange={e=>setTokenName(e.target.value)} aria-label={text.tokenName} className="min-w-0 flex-1 rounded-lg border border-slate-500/30 bg-transparent px-3 py-2" placeholder={text.tokenName}/><button type="button" onClick={()=>void createToken()} disabled={busy||!tokenName.trim()} className="rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white disabled:opacity-40">{text.createToken}</button></div>
        {newToken&&<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"><p className="mb-2 text-xs">{text.tokenWarning}</p><code className="block break-all text-xs">{newToken}</code><button type="button" onClick={()=>void copy(newToken)} className="mt-2 text-xs underline">{text.copy}</button></div>}
        {tokens.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500/20 py-2 text-sm"><div><p>{item.name} · {item.token_prefix}…</p><p className="text-xs opacity-60">{item.revoked_at?(dari?'لغو شده':'Revoked'):`Expires ${new Date(item.expires_at).toLocaleDateString()}`}</p></div>{!item.revoked_at&&<button type="button" onClick={()=>void revokeToken(item.id)} className="text-xs text-red-500 underline">{text.revoke}</button>}</div>)}
      </div>}
    </section>
    {requestId&&<p className="mt-3 text-xs opacity-60">{text.req}: {requestId}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
  </main>;
}
