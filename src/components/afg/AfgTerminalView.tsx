import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Terminal, Play, Plus, Search, Copy, Trash2, FolderUp, Download,
  ShieldCheck, ChevronDown, Clock3, XCircle, RefreshCw, FileCode2,
} from 'lucide-react';
import { apiUrl, apiFetch } from '../../lib/apiClient';
import {
  createVirtualTerminalFs, runVirtualCommand, sanitizeVirtualTerminalFs,
  type VirtualTerminalFs,
} from '../../lib/virtualTerminal';
import type { Language } from '../../types/afg';

type Session = { id: string; surface: string; created_at: string; last_active_at: string };
type CliToken = {
  id: string; name: string; token_prefix: string; created_at: string;
  expires_at: string; last_used_at: string | null; revoked_at: string | null; scopes: string[];
};
type Entry = {
  id: string; command: string; output: string; exitCode: number;
  durationMs: number; requestId: string; createdAt: string;
};
type WorkspaceSnapshot = { fs: VirtualTerminalFs; cwd: string; history: string[]; entries: Entry[] };
type WhoAmI = { user: { id: string; role: string }; authentication: string };

const COMMANDS = [
  'help', 'pwd', 'ls', 'cd', 'tree', 'mkdir', 'touch', 'cat', 'write', 'echo',
  'rm', 'cp', 'mv', 'find', 'grep', 'wc', 'head', 'tail', 'stat', 'download',
  'whoami', 'hostname', 'uname', 'date', 'history', 'clear', 'version',
  'afg help', 'afg status', 'afg account', 'afg models list', 'afg conv list', 'afg files list',
];

function csrfToken(): string {
  const value = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='))?.slice(9) || '';
  try { return decodeURIComponent(value); } catch { return value; }
}
function postHeaders(): Record<string, string> {
  return { 'X-CSRF-Token': csrfToken(), 'Content-Type': 'application/json' };
}
function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function emptySnapshot(): WorkspaceSnapshot {
  return { fs: createVirtualTerminalFs(), cwd: '/home/user', history: [], entries: [] };
}
function parseSnapshot(value: unknown): WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return emptySnapshot();
  const raw = value as Partial<WorkspaceSnapshot>;
  return {
    fs: sanitizeVirtualTerminalFs(raw.fs),
    cwd: typeof raw.cwd === 'string' && (raw.cwd === '/home/user' || raw.cwd.startsWith('/home/user/')) ? raw.cwd : '/home/user',
    history: Array.isArray(raw.history) ? raw.history.filter((item): item is string => typeof item === 'string').slice(-120) : [],
    entries: Array.isArray(raw.entries) ? raw.entries.filter((item): item is Entry => Boolean(item && typeof item.command === 'string' && typeof item.output === 'string')).slice(-120) : [],
  };
}

export function AfgTerminalView({ language }: { language: Language }) {
  const dari = language === 'dari';
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState('');
  const [cwd, setCwd] = useState('/home/user');
  const [fs, setFs] = useState<VirtualTerminalFs>(() => createVirtualTerminalFs());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [command, setCommand] = useState('');
  const [search, setSearch] = useState('');
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [tokenName, setTokenName] = useState('My CLI');
  const [tokens, setTokens] = useState<CliToken[]>([]);
  const [newToken, setNewToken] = useState('');
  const [showTokens, setShowTokens] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = ownerId ? 'afg_terminal_workspace_v2:' + ownerId : '';

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      try {
        const whoResponse = await apiFetch('/api/terminal/whoami');
        const who = await whoResponse.json() as WhoAmI;
        if (!alive) return;
        setOwnerId(who.user.id);
        setSignedIn(true);
        setServerAvailable(true);
        try {
          const sessionResponse = await apiFetch('/api/terminal/sessions');
          const sessionData = await sessionResponse.json();
          const active = Array.isArray(sessionData.sessions) ? sessionData.sessions as Session[] : [];
          if (!alive) return;
          setSessions(active);
          if (active[0]) setSession(active[0].id);
          else {
            const createdResponse = await fetch(apiUrl('/api/terminal/sessions'), {
              method: 'POST', credentials: 'include', headers: postHeaders(),
              body: JSON.stringify({ surface: 'web' }),
            });
            const createdData = await createdResponse.json();
            if (createdResponse.ok && createdData.session && alive) {
              setSessions([createdData.session]);
              setSession(createdData.session.id);
            } else if (alive) setServerAvailable(false);
          }
        } catch { if (alive) setServerAvailable(false); }
      } catch {
        if (alive) {
          setOwnerId('guest-local');
          setSignedIn(false);
          setServerAvailable(false);
        }
      }
    };
    void initialize();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    let snapshot = emptySnapshot();
    try {
      const saved = localStorage.getItem('afg_terminal_workspace_v2:' + ownerId);
      if (saved) snapshot = parseSnapshot(JSON.parse(saved));
    } catch { console.warn('AFG_TERMINAL_LOCAL_WORKSPACE_READ_FAILED'); }
    setFs(snapshot.fs);
    setCwd(snapshot.cwd);
    setHistory(snapshot.history);
    setEntries(snapshot.entries);
    setReady(true);
  }, [ownerId]);

  useEffect(() => {
    if (!ready || !storageKey) return;
    try {
      const snapshot: WorkspaceSnapshot = { fs, cwd, history: history.slice(-120), entries: entries.slice(-120) };
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch { setError(dari ? 'حافظه محلی پر شده است؛ چند فایل یا خروجی قدیمی را پاک کنید.' : 'Local storage is full. Remove some files or old terminal output.'); }
  }, [ready, storageKey, fs, cwd, history, entries, dari]);

  const loadAudit = useCallback(async (id: string) => {
    if (!id) return;
    const response = await apiFetch('/api/terminal/sessions/' + id + '/history');
    const data = await response.json();
    const rows = Array.isArray(data.history) ? data.history as Array<Record<string, unknown>> : [];
    const serverEntries: Entry[] = rows.reverse().map((item) => ({
      id: String(item.request_id || makeId()),
      command: String(item.command || ''),
      output: String(item.output_text || ''),
      exitCode: Number(item.exit_code || 0),
      durationMs: Number(item.duration_ms || 0),
      requestId: String(item.request_id || ''),
      createdAt: String(item.created_at || new Date().toISOString()),
    }));
    setEntries((previous) => {
      const localOnly = previous.filter((item) => !item.requestId);
      const combined = [...serverEntries, ...localOnly];
      return combined.slice(-120);
    });
  }, []);

  const loadTokens = useCallback(async () => {
    const response = await apiFetch('/api/terminal/tokens');
    const data = await response.json();
    setTokens(Array.isArray(data.tokens) ? data.tokens : []);
  }, []);

  useEffect(() => {
    if (showTokens && signedIn && serverAvailable) {
      void loadTokens().catch(() => setError(dari ? 'فهرست توکن‌ها بارگذاری نشد.' : 'Could not load CLI tokens.'));
    }
  }, [showTokens, signedIn, serverAvailable, loadTokens, dari]);

  useEffect(() => {
    if (session && serverAvailable) {
      void loadAudit(session).catch(() => setError(dari ? 'تاریخچه نشست بارگذاری نشد.' : 'Could not load session history.'));
    }
  }, [session, serverAvailable, loadAudit, dari]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries]);

  async function createSession() {
    if (!signedIn || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/terminal/sessions'), {
        method: 'POST', credentials: 'include', headers: postHeaders(),
        body: JSON.stringify({ surface: 'web' }),
      });
      const data = await response.json();
      if (!response.ok || !data.session) throw new Error(data.error || 'Could not create a terminal session.');
      setSessions((previous) => [data.session, ...previous]);
      setSession(data.session.id);
      setEntries([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a session.'); }
    finally { setBusy(false); }
  }

  async function executeAfgCommand(value: string): Promise<{ output: string; exitCode: number; requestId: string; durationMs: number }> {
    if (!signedIn) throw new Error(dari ? 'برای فرمان‌های حساب AFG AI ابتدا وارد حساب شوید.' : 'Sign in to use account-level AFG AI commands.');
    if (!session || !serverAvailable) throw new Error(dari ? 'سرویس فرمان‌های حساب موقتاً در دسترس نیست.' : 'The account command service is temporarily unavailable.');
    const startedAt = Date.now();
    const response = await fetch(apiUrl('/api/terminal/sessions/' + session + '/commands'), {
      method: 'POST', credentials: 'include', headers: postHeaders(),
      body: JSON.stringify({ command: value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && typeof data.output !== 'string') throw new Error(data.error || ('Command failed (' + response.status + ').'));
    return {
      output: typeof data.output === 'string' ? data.output : data.error || '',
      exitCode: Number.isFinite(Number(data.exitCode)) ? Number(data.exitCode) : (response.ok ? 0 : 1),
      requestId: String(data.requestId || response.headers.get('X-Request-Id') || ''),
      durationMs: Date.now() - startedAt,
    };
  }

  async function run(event?: React.FormEvent) {
    event?.preventDefault();
    const value = command.trim();
    if (!value || busy || !ready) return;
    setCommand('');
    setError('');
    setHistory((previous) => [...previous.filter((item) => item !== value), value].slice(-120));
    setHistoryIndex(-1);
    const startedAt = Date.now();
    setBusy(true);
    try {
      const result = runVirtualCommand(value, cwd, fs);
      let output = result.output;
      let exitCode = result.exitCode;
      let nextCwd = result.cwd;
      let nextFs = result.fs;
      let id = makeId();
      let reqId = '';
      let durationMs = Date.now() - startedAt;

      if (result.clear) {
        setEntries([]);
        setCwd(nextCwd);
        setFs(nextFs);
        return;
      }

      if (result.isAfgCommand) {
        const apiResult = await executeAfgCommand(value);
        output = apiResult.output;
        exitCode = apiResult.exitCode;
        reqId = apiResult.requestId;
        durationMs = apiResult.durationMs;
        id = reqId || id;
        setRequestId(reqId);
      }

      if (result.download) {
        const blob = new Blob([result.download.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.download.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }

      setCwd(nextCwd);
      setFs(nextFs);
      const entry: Entry = {
        id, command: value, output, exitCode, durationMs, requestId: reqId,
        createdAt: new Date().toISOString(),
      };
      setEntries((previous) => [...previous, entry].slice(-120));
      if (reqId && session) void loadAudit(session).catch(() => {});
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Command failed.';
      setError(message);
      setEntries((previous) => [...previous, {
        id: makeId(), command: value, output: message, exitCode: 1, durationMs: Date.now() - startedAt,
        requestId: '', createdAt: new Date().toISOString(),
      }].slice(-120));
    } finally { setBusy(false); }
  }

  function clearScreen() { setEntries([]); setRequestId(''); setError(''); inputRef.current?.focus(); }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(0, historyIndex < 0 ? history.length - 1 : historyIndex - 1);
      setHistoryIndex(next);
      setCommand(history[next] || '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = historyIndex + 1;
      if (next >= history.length) { setHistoryIndex(-1); setCommand(''); }
      else { setHistoryIndex(next); setCommand(history[next] || ''); }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const prefix = command.trim().toLowerCase();
      if (!prefix) return;
      const matches = COMMANDS.filter((item) => item.startsWith(prefix));
      if (matches.length === 1) setCommand(matches[0] + ' ');
      else if (matches.length > 1) setEntries((previous) => [...previous, {
        id: makeId(), command: '', output: matches.join('   '), exitCode: 0,
        durationMs: 0, requestId: '', createdAt: new Date().toISOString(),
      }].slice(-120));
    } else if (event.key === 'l' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      clearScreen();
    }
  }

  async function createToken() {
    if (!tokenName.trim() || busy) return;
    setBusy(true); setError(''); setNewToken('');
    try {
      const response = await fetch(apiUrl('/api/terminal/tokens'), {
        method: 'POST', credentials: 'include', headers: postHeaders(),
        body: JSON.stringify({ name: tokenName.trim(), scopes: ['terminal.read'] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Token creation failed.');
      setNewToken(data.token);
      await loadTokens();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Token creation failed.'); }
    finally { setBusy(false); }
  }

  async function revokeToken(id: string) {
    if (!window.confirm(dari ? 'این توکن لغو شود؟' : 'Revoke this CLI token?')) return;
    try {
      const response = await fetch(apiUrl('/api/terminal/tokens/' + id), { method: 'DELETE', credentials: 'include', headers: postHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Token revocation failed.');
      await loadTokens();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Token revocation failed.'); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); }
    catch { setError(dari ? 'دسترسی به کلیپ‌بورد ممکن نشد.' : 'Clipboard access is unavailable.'); }
  }

  async function uploadLocalFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 48_000) { setError(dari ? 'حداکثر اندازه هر فایل ۴۸ کیلوبایت است.' : 'Each local text file is limited to 48 KB.'); return; }
    const name = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'uploaded.txt';
    try {
      const text = await file.text();
      const path = cwd + '/' + name;
      const next = { dirs: [...fs.dirs], files: { ...fs.files, [path]: text } };
      setFs(sanitizeVirtualTerminalFs(next));
      setEntries((previous) => [...previous, {
        id: makeId(), command: 'upload ' + name, output: 'Saved locally to ' + path,
        exitCode: 0, durationMs: 0, requestId: '', createdAt: new Date().toISOString(),
      }].slice(-120));
    } catch { setError(dari ? 'بارگذاری فایل متنی انجام نشد.' : 'Could not read that text file.'); }
  }

  const filteredEntries = useMemo(() => entries.filter((item) =>
    !search || (item.command + ' ' + item.output + ' ' + item.requestId).toLowerCase().includes(search.toLowerCase())
  ), [entries, search]);
  const fileCount = Object.keys(fs.files).length;
  const dariText = {
    title: 'ترمینل پیشرفته AFG AI',
    subtitle: 'محیط کاری مجازی، مدیریت فایل‌ها و فرمان‌های حساب کاربری',
    workspace: 'فضای کاری محلی',
    local: 'محلی و ایزوله',
    account: signedIn ? 'حساب متصل' : 'حالت مهمان',
    shellNotice: 'امنیت: این ترمینل به سیستم‌عامل یا فایل‌های سرور دسترسی ندارد. فایل‌های فضای کاری فقط در همین مرورگر ذخیره می‌شوند؛ اجرای مستقیم Bash، Python و Node تا زمان اتصال sandbox ایزوله فعال نیست.',
    sessions: 'نشست‌ها',
    newSession: 'نشست جدید',
    upload: 'افزودن فایل',
    run: 'اجرا',
    placeholder: 'فرمان را بنویسید؛ مثلاً mkdir projects',
    search: 'جستجو در خروجی',
    empty: 'هنوز فرمانی اجرا نشده است. برای دیدن راهنما help را وارد کنید.',
    help: 'راهنمای فرمان‌ها',
    files: 'فایل‌ها',
    history: 'تاریخچه',
    tokens: 'توکن‌های CLI',
    tokenName: 'نام توکن',
    createToken: 'ساخت توکن',
    revoke: 'لغو',
    tokenWarning: 'این توکن فقط یک بار نمایش داده می‌شود. آن را در جای امن نگه دارید.',
    copy: 'کپی',
    clear: 'پاک‌سازی صفحه',
    status: 'وضعیت',
    prompt: 'فرمان',
    output: 'خروجی',
    duration: 'زمان اجرا',
    commandExamples: 'فرمان‌های سریع',
    loginHint: 'برای فرمان‌های حساب AFG AI مانند afg models list وارد حساب شوید. محیط فایل محلی بدون ورود هم قابل استفاده است.',
  };
  const englishText = {
    title: 'AFG AI Advanced Terminal',
    subtitle: 'Virtual workspace, file tools and account-level commands',
    workspace: 'Local workspace',
    local: 'Local & isolated',
    account: signedIn ? 'Account connected' : 'Guest mode',
    shellNotice: 'Security: this terminal cannot access the host operating system or server files. Workspace files stay in this browser. Direct Bash, Python and Node execution remain disabled until an isolated sandbox runner is connected.',
    sessions: 'Sessions',
    newSession: 'New session',
    upload: 'Upload file',
    run: 'Run',
    placeholder: 'Enter a command, e.g. mkdir projects',
    search: 'Search output',
    empty: 'No commands yet. Type help to see the command guide.',
    help: 'Command guide',
    files: 'Files',
    history: 'History',
    tokens: 'CLI tokens',
    tokenName: 'Token name',
    createToken: 'Create token',
    revoke: 'Revoke',
    tokenWarning: 'This token is shown only once. Store it securely.',
    copy: 'Copy',
    clear: 'Clear screen',
    status: 'Status',
    prompt: 'Command',
    output: 'Output',
    duration: 'Duration',
    commandExamples: 'Quick commands',
    loginHint: 'Sign in for AFG AI account commands such as afg models list. The local file workspace also works as a guest.',
  };
  const text = dari ? dariText : englishText;
  const workspaceLabel = cwd === '/home/user' ? '~' : cwd.replace('/home/user', '~');
  const outputText = entries.map((item) => (item.command ? '$ ' + item.command + '\n' : '') + item.output).join('\n\n');

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[1500px] flex-col gap-4 p-3 pb-8 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.12)]">
            <Terminal size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">{text.title}</h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{text.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-500">
            <ShieldCheck size={14} />{text.local}
          </span>
          <span className="rounded-full border border-slate-500/20 px-3 py-1.5 text-xs text-slate-500">{text.account}</span>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 px-3 py-2 text-xs font-semibold hover:border-cyan-400/60">
            <FolderUp size={15} />{text.upload}
          </button>
          <input ref={fileInputRef} type="file" accept=".txt,.md,.json,.js,.ts,.py,.html,.css,.csv,.xml,.yaml,.yml,.sh" className="hidden" onChange={(event) => void uploadLocalFile(event)} />
          <button type="button" onClick={() => void createSession()} disabled={!signedIn || busy} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
            <Plus size={15} />{text.newSession}
          </button>
        </div>
      </header>

      <div role="status" className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-xs leading-6 text-amber-700 dark:text-amber-200">
        <strong>{text.status}: </strong>{text.shellNotice}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3">
          <section className="rounded-2xl border border-slate-500/20 bg-white/40 p-3 dark:bg-slate-950/30">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{text.workspace}</h2>
              <FileCode2 size={15} className="text-cyan-500" />
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span className="text-slate-500">{text.files}</span><strong>{fileCount}</strong></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">{text.history}</span><strong>{history.length}</strong></div>
              <div className="break-all rounded-lg bg-slate-500/[0.07] p-2 font-mono text-[11px] text-cyan-600 dark:text-cyan-300">{workspaceLabel}</div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-500/20 p-3">
            <button type="button" onClick={() => setShowSessions((value) => !value)} className="flex w-full items-center justify-between text-xs font-bold text-slate-500">
              {text.sessions}<ChevronDown size={15} className={showSessions ? 'rotate-180 transition' : 'transition'} />
            </button>
            {showSessions && <div className="mt-3 space-y-1">
              {sessions.map((item) => (
                <button key={item.id} type="button" onClick={() => setSession(item.id)} className={'block w-full truncate rounded-lg px-2 py-2 text-start text-[11px] ' + (session === item.id ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300' : 'text-slate-500 hover:bg-slate-500/10')}>
                  {item.id.slice(0, 8)} · {item.surface}
                </button>
              ))}
              {!sessions.length && <p className="py-2 text-[11px] text-slate-500">{signedIn ? 'No server sessions yet.' : 'Sign in to sync server sessions.'}</p>}
            </div>}
          </section>
          <section className="rounded-2xl border border-slate-500/20 p-3">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{text.commandExamples}</h2>
            <div className="flex flex-wrap gap-2">
              {['help', 'ls', 'pwd', 'tree', 'afg status', 'afg models list'].map((item) => (
                <button key={item} type="button" onClick={() => { setCommand(item); inputRef.current?.focus(); }} className="rounded-lg border border-slate-500/20 px-2 py-1.5 font-mono text-[10px] hover:border-cyan-400/60 hover:text-cyan-500">{item}</button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-500/20 p-3">
            <button type="button" onClick={() => setShowTokens((value) => !value)} className="flex w-full items-center justify-between text-xs font-bold">
              {text.tokens}<ChevronDown size={15} className={showTokens ? 'rotate-180 transition' : 'transition'} />
            </button>
            {showTokens && <div className="mt-3 space-y-3">
              {!signedIn && <p className="text-[11px] text-slate-500">{text.loginHint}</p>}
              <input value={tokenName} onChange={(event) => setTokenName(event.target.value)} aria-label={text.tokenName} placeholder={text.tokenName} className="w-full rounded-lg border border-slate-500/25 bg-transparent px-2.5 py-2 text-xs" />
              <button type="button" onClick={() => void createToken()} disabled={!signedIn || busy || !tokenName.trim()} className="w-full rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{text.createToken}</button>
              {newToken && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                <p className="mb-2 text-[10px]">{text.tokenWarning}</p>
                <code className="block break-all text-[10px]">{newToken}</code>
                <button type="button" onClick={() => void copy(newToken)} className="mt-2 text-[10px] underline">{text.copy}</button>
              </div>}
              {tokens.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-t border-slate-500/15 pt-2 text-[11px]">
                <div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="text-slate-500">{item.revoked_at ? 'Revoked' : 'Active'} · {item.token_prefix}…</p></div>
                {!item.revoked_at && <button type="button" onClick={() => void revokeToken(item.id)} className="text-red-500 underline">{text.revoke}</button>}
              </div>)}
            </div>}
          </section>
        </aside>

        <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-[#07111f] text-slate-100 shadow-[0_20px_80px_rgba(2,8,23,.28)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-400" /><i className="h-2.5 w-2.5 rounded-full bg-amber-300" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
              <span className="ms-2 font-mono text-[11px] text-slate-400">AFG AI / terminal / {workspaceLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              <label className="relative">
                <Search size={13} className="absolute start-2.5 top-2.5 text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={text.search} placeholder={text.search} className="w-36 rounded-lg border border-white/10 bg-black/20 py-2 ps-8 pe-2 text-[11px] outline-none focus:border-cyan-400/60 sm:w-48" />
              </label>
              <button type="button" onClick={() => void copy(outputText)} title="Copy terminal output" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><Copy size={15} /></button>
              <button type="button" onClick={clearScreen} title={text.clear} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><Trash2 size={15} /></button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 font-mono text-[12px] leading-6 sm:px-5 sm:text-[13px]" dir="ltr" aria-live="polite">
            {!filteredEntries.length && <div className="flex min-h-[330px] flex-col items-start justify-center gap-3 text-slate-500">
              <div className="text-3xl text-cyan-400">AFG_</div>
              <p>{text.empty}</p>
              <pre className="whitespace-pre-wrap text-[11px] text-slate-600">Type help to list commands. Try: mkdir projects{"\n"}cd projects{"\n"}echo "Hello AFG AI" &gt; hello.txt{"\n"}cat hello.txt</pre>
            </div>}
            {filteredEntries.map((item) => (
              <article key={item.id} className="mb-4 border-b border-white/[0.06] pb-3">
                {item.command && <p className="break-all text-cyan-300"><span className="text-emerald-400">user@afg-ai</span>:<span className="text-sky-300">{workspaceLabel}</span>$ {item.command}</p>}
                {item.output && <pre className="mt-1 whitespace-pre-wrap break-words text-slate-200">{item.output}</pre>}
                {!item.output && item.exitCode === 0 && <p className="text-[10px] text-emerald-400">✓ completed</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
                  <span>{item.exitCode === 0 ? 'exit 0' : 'exit ' + item.exitCode}</span>
                  <span>{item.durationMs} ms</span>
                  {item.requestId && <button type="button" onClick={() => void copy(item.requestId)} className="underline">request: {item.requestId.slice(0, 12)}</button>}
                  <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                </div>
              </article>
            ))}
            {busy && <p className="animate-pulse text-cyan-300">processing command…</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={(event) => void run(event)} className="border-t border-white/10 bg-black/20 p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{text.prompt}</span><span>{cwd}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-[#0b1b2b] px-3 py-2 focus-within:border-cyan-400/70 focus-within:shadow-[0_0_20px_rgba(34,211,238,.08)]">
              <span className="shrink-0 font-mono text-sm font-bold text-emerald-400">$</span>
              <input ref={inputRef} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={handleInputKeyDown} placeholder={text.placeholder} disabled={busy || !ready} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[12px] text-white outline-none placeholder:text-slate-600 sm:text-sm" />
              <button type="submit" disabled={!command.trim() || busy || !ready} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-40">
                <Play size={13} fill="currentColor" />{text.run}
              </button>
            </div>
            {error && <div role="alert" className="mt-2 flex items-start gap-2 text-xs text-red-400"><XCircle size={14} className="mt-0.5 shrink-0" />{error}</div>}
            {requestId && <p className="mt-2 break-all text-[10px] text-slate-600">Request ID: {requestId}</p>}
          </form>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-500" />{text.local} · {fileCount} {text.files}</span>
        <button type="button" onClick={() => setShowHelp((value) => !value)} className="inline-flex items-center gap-1.5 underline underline-offset-4"><Clock3 size={13} />{text.help}</button>
        <button type="button" onClick={() => { setSearch(''); setEntries([]); setError(''); }} className="inline-flex items-center gap-1.5 underline underline-offset-4"><RefreshCw size={13} />{text.clear}</button>
      </footer>
      {showHelp && <section className="rounded-2xl border border-slate-500/20 bg-slate-500/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{text.help}</h2><button type="button" onClick={() => setShowHelp(false)} aria-label="Close help"><XCircle size={16}/></button></div>
        <pre dir="ltr" className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-500">{'help\nmkdir projects\ncd projects\necho "Hello AFG AI" > note.txt\ncat note.txt\nfind ~\ndownload note.txt\nafg status\nafg models list'}</pre>
      </section>}
    </main>
  );
}
