import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, ToggleLeft, Server, Cpu, ScrollText, ShieldAlert,
  Activity, RefreshCw, AlertTriangle, ShieldCheck, Ban, CheckCircle2, Loader2,
} from 'lucide-react';
import type { Language } from '../../types/afg';

const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

function csrf(): string {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='));
  const value = cookie ? cookie.slice('afg_csrf='.length) : '';
  try { return decodeURIComponent(value); } catch { return value; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrf());
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API + path, { ...init, headers, credentials: 'include', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || 'The admin request failed.'));
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The admin request timed out.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

type SectionId = 'overview' | 'users' | 'flags' | 'providers' | 'models' | 'audit' | 'security';

const copy = {
  en: {
    title: 'Admin Console', subtitle: 'Platform operations, protected by server-side role checks',
    overview: 'Overview', users: 'Users', flags: 'Feature flags', providers: 'Providers',
    models: 'Models', audit: 'Audit log', security: 'Security events',
    refresh: 'Refresh', working: 'Working…', loadFailed: 'Data could not be loaded.',
    saved: 'Saved.', actionFailed: 'Action failed.',
    aiRequestsToday: 'AI requests today', errorRate: 'Error rate %', costToday: 'Known cost today (USD)',
    activeUsers: 'Active users today', latency: 'Avg latency (ms)', conversations: 'Conversations',
    usersTotal: 'Users', usersActive: 'Active', usersSuspended: 'Suspended',
    alerts: 'Operational alerts', noAlerts: 'No operational alerts.',
    role: 'Role', status: 'Status', lastSeen: 'Last seen', requests30d: 'Requests (30d)',
    suspend: 'Suspend', activate: 'Activate', email: 'Email',
    flagKey: 'Flag', enabled: 'Enabled', description: 'Description',
    provider: 'Provider', configured: 'Configured', health: 'Health', lastError: 'Last error',
    discoverModels: 'Discover models', discovering: 'Discovering…', discovered: 'models discovered and registered (disabled by default).',
    model: 'Model', context: 'Context', verified: 'Verified', disable: 'Disable', enable: 'Enable',
    action: 'Action', actor: 'Actor', when: 'When', target: 'Target',
    eventType: 'Event', severity: 'Severity', empty: 'No records.',
    dbHealthy: 'Database', lastMigration: 'Last migration',
  },
  dari: {
    title: 'کنسول مدیریت', subtitle: 'عملیات پلتفرم، محافظت‌شده با بررسی نقش در سرور',
    overview: 'نمای کلی', users: 'کاربران', flags: 'فیچر فلگ‌ها', providers: 'ارائه‌دهندگان',
    models: 'مدل‌ها', audit: 'لاگ حسابرسی', security: 'رویدادهای امنیتی',
    refresh: 'بازخوانی', working: 'در حال اجرا…', loadFailed: 'بارگذاری داده ناموفق بود.',
    saved: 'ذخیره شد.', actionFailed: 'عملیات ناموفق بود.',
    aiRequestsToday: 'درخواست‌های هوش مصنوعی امروز', errorRate: 'نرخ خطا ٪', costToday: 'هزینه شناخته‌شده امروز (دلار)',
    activeUsers: 'کاربران فعال امروز', latency: 'میانگین تأخیر (میلی‌ثانیه)', conversations: 'گفت‌وگوها',
    usersTotal: 'کاربران', usersActive: 'فعال', usersSuspended: 'معلق',
    alerts: 'هشدارهای عملیاتی', noAlerts: 'هشدار عملیاتی وجود ندارد.',
    role: 'نقش', status: 'وضعیت', lastSeen: 'آخرین حضور', requests30d: 'درخواست‌ها (۳۰ روز)',
    suspend: 'تعلیق', activate: 'فعال‌سازی', email: 'ایمیل',
    flagKey: 'فلگ', enabled: 'فعال', description: 'توضیح',
    provider: 'ارائه‌دهنده', configured: 'پیکربندی‌شده', health: 'سلامت', lastError: 'آخرین خطا',
    discoverModels: 'کشف مدل‌ها', discovering: 'در حال کشف…', discovered: 'مدل کشف و ثبت شد (به‌صورت پیش‌فرض غیرفعال).',
    model: 'مدل', context: 'زمینه', verified: 'تأییدشده', disable: 'غیرفعال', enable: 'فعال',
    action: 'عملیات', actor: 'عامل', when: 'زمان', target: 'هدف',
    eventType: 'رویداد', severity: 'شدت', empty: 'رکوردی نیست.',
    dbHealthy: 'پایگاه داده', lastMigration: 'آخرین مایگریشن',
  },
  pashto: {
    title: 'د مدیریت کنسول', subtitle: 'د پلیټفارم عملیات، د سرور د نقشې کتنې سره خوندي',
    overview: 'کتنه', users: 'کاروونکي', flags: 'فیچر فلګونه', providers: 'چمتوکوونکي',
    models: 'ماډلونه', audit: 'د حسابرسی لوګ', security: 'امنیتي پیښې',
    refresh: 'بیا لوستل', working: 'کار روان…', loadFailed: 'ډاټا بار نه شوه.',
    saved: 'خوندي شو.', actionFailed: 'عملیه ناکامه شوه.',
    aiRequestsToday: 'د نن ورځې غوښتنې', errorRate: 'د خطا کچه ٪', costToday: 'د نن معلوم لګښت (ډالر)',
    activeUsers: 'فعال کاروونکي نن', latency: 'منځنۍ ځنډ (ms)', conversations: 'خبرې اترې',
    usersTotal: 'کاروونکي', usersActive: 'فعال', usersSuspended: 'ودرول شوي',
    alerts: 'عملیاتي خبرتیاوې', noAlerts: 'عملیاتي خبرتیا نشته.',
    role: 'رول', status: 'حالت', lastSeen: 'وروستنی لید', requests30d: 'غوښتنې (۳۰ ورځې)',
    suspend: 'ودرول', activate: 'فعالول', email: 'برېښنالیک',
    flagKey: 'فلګ', enabled: 'فعال', description: 'تشریح',
    provider: 'چمتوکوونکی', configured: 'تنظیم شوی', health: 'روغتیا', lastError: 'وروستنی خطا',
    discoverModels: 'ماډلونه پیداکول', discovering: 'پیداکول…', discovered: 'ماډلونه وموندل شول او ثبت شول (په ډیفالټ غیرفعال).',
    model: 'ماډل', context: 'منظره', verified: 'تایید شوی', disable: 'غیرفعال', enable: 'فعال',
    action: 'عملیه', actor: 'عامل', when: 'وخت', target: 'هدف',
    eventType: 'پیښه', severity: 'شدت', empty: 'ثبت نشته.',
    dbHealthy: 'ډاټابیس', lastMigration: 'وروستنی مایګریشن',
  },
  arabic: {
    title: 'لوحة المسؤول', subtitle: 'عمليات المنصة، محمية بفحص الدور في الخادم',
    overview: 'نظرة عامة', users: 'المستخدمون', flags: 'مفاتيح الميزات', providers: 'المزودون',
    models: 'النماذج', audit: 'سجل التدقيق', security: 'أحداث الأمان',
    refresh: 'تحديث', working: 'جارٍ التنفيذ…', loadFailed: 'تعذر تحميل البيانات.',
    saved: 'تم الحفظ.', actionFailed: 'فشل الإجراء.',
    aiRequestsToday: 'طلبات الذكاء الاصطناعي اليوم', errorRate: 'نسبة الأخطاء ٪', costToday: 'التكلفة المعروفة اليوم (دولار)',
    activeUsers: 'المستخدمون النشطون اليوم', latency: 'متوسط الاستجابة (ms)', conversations: 'المحادثات',
    usersTotal: 'المستخدمون', usersActive: 'نشط', usersSuspended: 'معلق',
    alerts: 'تنبيهات تشغيلية', noAlerts: 'لا توجد تنبيهات.',
    role: 'الدور', status: 'الحالة', lastSeen: 'آخر ظهور', requests30d: 'الطلبات (٣٠ يومًا)',
    suspend: 'تعليق', activate: 'تنشيط', email: 'البريد الإلكتروني',
    flagKey: 'المفتاح', enabled: 'مُمكّن', description: 'الوصف',
    provider: 'المزود', configured: 'مُعدّ', health: 'الصحة', lastError: 'آخر خطأ',
    discoverModels: 'استكشاف النماذج', discovering: 'جارٍ الاستكشاف…', discovered: 'نموذجًا مكتشفًا ومسجلًا (معطّل افتراضيًا).',
    model: 'النموذج', context: 'السياق', verified: 'موثق', disable: 'تعطيل', enable: 'تمكين',
    action: 'الإجراء', actor: 'الفاعل', when: 'الوقت', target: 'الهدف',
    eventType: 'الحدث', severity: 'الخطورة', empty: 'لا سجلات.',
    dbHealthy: 'قاعدة البيانات', lastMigration: 'آخر ترحيل',
  },
} as const satisfies Record<string, Record<string, string>>;

type OverviewResponse = {
  dashboard: {
    aiRequestsToday: number; errorRatePercent: number; todayCostUsd: number;
    activeUsersToday: number; averageLatencyMs: number; alerts: Array<{ kind: string; severity: string; message: string; count?: number }>;
  };
  storage: { conversations: number };
  users: { total: number; active: number; suspended: number };
};

const SECTIONS: Array<{ id: SectionId; icon: React.ElementType }> = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'users', icon: Users },
  { id: 'flags', icon: ToggleLeft },
  { id: 'providers', icon: Server },
  { id: 'models', icon: Cpu },
  { id: 'audit', icon: ScrollText },
  { id: 'security', icon: ShieldAlert },
];

const card = 'rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4';
const th = 'px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400';
const td = 'px-3 py-2 text-sm text-slate-200 align-top';
const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-600/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/60 hover:text-cyan-300 disabled:opacity-50';

function fmtDateTime(value: unknown, language: Language): string {
  const parsed = typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  try { return new Intl.DateTimeFormat(getIntlLocale(language), { dateStyle: 'short', timeStyle: 'short' }).format(parsed); }
  catch { return parsed.toISOString(); }
}

function getIntlLocale(language: Language): string {
  const map: Partial<Record<Language, string>> = {
    dari: 'fa-AF', persian: 'fa-IR', pashto: 'ps-AF', arabic: 'ar', english: 'en-US',
  };
  return map[language] || 'en-US';
}

export const AfgAdminConsole: React.FC<{ language: Language }> = ({ language }) => {
  const t = (copy as unknown as Record<Language, typeof copy.en>)[language] || copy.en;
  const [section, setSection] = useState<SectionId>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [security, setSecurity] = useState<any[]>([]);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState<string | null>(null);

  const load = useCallback(async (target: SectionId) => {
    setLoading(true);
    setError(null);
    try {
      if (target === 'overview') {
        const [data, healthData] = await Promise.all([
          request<OverviewResponse>('/api/admin/overview'),
          request<any>('/api/admin/system-health').catch(() => null),
        ]);
        setOverview(data);
        setHealth(healthData);
      } else if (target === 'users') {
        setUsers((await request<any>('/api/admin/users')).users || []);
      } else if (target === 'flags') {
        setFlags((await request<any>('/api/admin/feature-flags')).flags || []);
      } else if (target === 'providers') {
        setProviders((await request<any>('/api/admin/providers')).providers || []);
      } else if (target === 'models') {
        setModels((await request<any>('/api/admin/models')).models || []);
      } else if (target === 'audit') {
        setAudit((await request<any>('/api/admin/audit')).events || []);
      } else if (target === 'security') {
        setSecurity((await request<any>('/api/admin/security-events')).events || []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.loadFailed]);

  useEffect(() => { void load(section); }, [section, load]);

  const run = async (action: () => Promise<void>, successMessage?: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t.actionFailed);
    }
  };

  const setUserStatus = (userId: string, status: 'active' | 'suspended') =>
    run(async () => {
      await request('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId, status }) });
      setUsers((rows) => rows.map((row) => (row.id === userId ? { ...row, status } : row)));
    }, t.saved);

  const toggleFlag = (key: string, enabled: boolean) =>
    run(async () => {
      await request('/api/admin/feature-flags', { method: 'PATCH', body: JSON.stringify({ key, enabled }) });
      setFlags((rows) => rows.map((row) => (row.flag_key === key ? { ...row, enabled } : row)));
    }, t.saved);

  const toggleModel = (providerId: string, modelId: string, enabled: boolean) => {
    const key = providerId + '::' + modelId;
    setBusyModel(key);
    void run(async () => {
      await request('/api/admin/models', { method: 'PATCH', body: JSON.stringify({ providerId, modelId, enabled }) });
      setModels((rows) => rows.map((row) => (row.provider_key === providerId && row.model_key === modelId ? { ...row, enabled } : row)));
      setBusyModel(null);
    }, t.saved);
  };

  const discoverModels = (providerId: string) => {
    setDiscovering(providerId);
    void run(async () => {
      const result = await request<any>(`/api/admin/providers/${providerId}/discover-models`, { method: 'POST' });
      setDiscovering(null);
      setNotice(String(result.discovered ?? 0) + ' ' + t.discovered);
    });
  };

  const metric = (label: string, value: string) => (
    <div className={card} key={label}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6" dir={language === 'english' ? 'ltr' : 'rtl'}>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <ShieldCheck size={22} className="text-cyan-400" aria-hidden="true" />
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{t.subtitle}</p>
        </div>
        <button className={btn} onClick={() => void load(section)} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {t.refresh}
        </button>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t.title}>
        {SECTIONS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            aria-current={section === id ? 'true' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
              section === id ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40' : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {t[id]}
          </button>
        ))}
      </nav>

      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-600/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</div>}
      {loading && !notice && !error && <div className="mb-4 flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" />{t.working}</div>}

      {section === 'overview' && overview && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {metric(t.aiRequestsToday, String(overview.dashboard.aiRequestsToday))}
            {metric(t.errorRate, String(overview.dashboard.errorRatePercent))}
            {metric(t.costToday, String(overview.dashboard.todayCostUsd))}
            {metric(t.activeUsers, String(overview.dashboard.activeUsersToday))}
            {metric(t.latency, String(overview.dashboard.averageLatencyMs))}
            {metric(t.conversations, String(overview.storage?.conversations ?? 0))}
          </div>
          <div className={card}>
            <h2 className="mb-2 text-sm font-semibold text-slate-200">{t.users}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <span>{t.usersTotal}: <b>{overview.users.total}</b></span>
              <span>{t.usersActive}: <b>{overview.users.active}</b></span>
              <span>{t.usersSuspended}: <b>{overview.users.suspended}</b></span>
            </div>
          </div>
          <div className={card}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <AlertTriangle size={15} className="text-amber-400" aria-hidden="true" />
              {t.alerts}
            </h2>
            {overview.dashboard.alerts.length === 0 ? (
              <p className="text-sm text-slate-400">{t.noAlerts}</p>
            ) : (
              <ul className="space-y-2">
                {overview.dashboard.alerts.map((alertItem) => (
                  <li key={alertItem.kind + String(alertItem.message)} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${alertItem.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-400'}`} aria-hidden="true" />
                    <span className="text-slate-300">{alertItem.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {health?.database && (
            <div className={card}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Activity size={15} className="text-cyan-400" aria-hidden="true" />
                {t.dbHealthy}
              </h2>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <span>{t.dbHealthy}: <b className={health.database.healthy ? 'text-emerald-400' : 'text-rose-400'}>{health.database.healthy ? 'OK' : 'DOWN'}</b></span>
                <span>{health.database.latencyMs} ms</span>
                <span>{t.lastMigration}: <code className="text-xs text-slate-400">{String(health.database.lastMigration || '—')}</code></span>
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'users' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/60">
          <table className="min-w-full divide-y divide-slate-700/60">
            <thead className="bg-slate-900/80">
              <tr>
                <th className={th}>{t.email}</th><th className={th}>{t.role}</th><th className={th}>{t.status}</th>
                <th className={th}>{t.lastSeen}</th><th className={th}>{t.requests30d}</th><th className={th}>{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {users.map((row) => (
                <tr key={row.id}>
                  <td className={td}>{row.email}</td>
                  <td className={td}><code className="text-xs text-cyan-300">{row.role}</code></td>
                  <td className={td}>{row.status}</td>
                  <td className={td}>{fmtDateTime(row.last_seen_at, language)}</td>
                  <td className={td}>{row.requests_30d ?? 0}</td>
                  <td className={td}>
                    {row.status === 'active' ? (
                      <button className={btn} onClick={() => void setUserStatus(row.id, 'suspended')}><Ban size={13} />{t.suspend}</button>
                    ) : row.status === 'suspended' ? (
                      <button className={btn} onClick={() => void setUserStatus(row.id, 'active')}><CheckCircle2 size={13} />{t.activate}</button>
                    ) : <span className="text-xs text-slate-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && !loading && <p className="px-4 py-6 text-sm text-slate-400">{t.empty}</p>}
        </div>
      )}

      {section === 'flags' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/60">
          <table className="min-w-full divide-y divide-slate-700/60">
            <thead className="bg-slate-900/80">
              <tr><th className={th}>{t.flagKey}</th><th className={th}>{t.enabled}</th><th className={th}>{t.description}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {flags.map((row) => (
                <tr key={row.flag_key}>
                  <td className={td}><code className="text-xs text-cyan-300">{row.flag_key}</code></td>
                  <td className={td}>
                    <button
                      className={`inline-flex h-6 w-11 items-center rounded-full transition ${row.enabled ? 'bg-emerald-500/80 justify-end' : 'bg-slate-600 justify-start'}`}
                      role="switch"
                      aria-checked={row.enabled === true}
                      aria-label={row.flag_key}
                      onClick={() => void toggleFlag(row.flag_key, !(row.enabled === true))}
                    >
                      <span className="mx-0.5 h-5 w-5 rounded-full bg-white" />
                    </button>
                  </td>
                  <td className={`${td} text-slate-400`}>{row.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {flags.length === 0 && !loading && <p className="px-4 py-6 text-sm text-slate-400">{t.empty}</p>}
        </div>
      )}

      {section === 'providers' && (
        <div className="grid gap-3 md:grid-cols-2">
          {providers.map((row) => (
            <div className={card} key={row.id}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">{row.displayName || row.id}</h3>
                <code className="text-xs text-cyan-300">{row.id}</code>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div>{t.configured}: <b className={row.configured ? 'text-emerald-400' : 'text-rose-400'}>{row.configured ? '✓' : '✕'}</b></div>
                <div>{t.health}: <b className={row.last_health_ok === true ? 'text-emerald-400' : row.last_health_ok === false ? 'text-rose-400' : 'text-slate-400'}>{row.last_health_ok === true ? '✓' : row.last_health_ok === false ? '✕' : '—'}</b></div>
                <div>enabled: <b>{String(row.enabled)}</b></div>
                <div>source: <code>{row.source || '—'}</code></div>
              </dl>
              {row.last_error_code && <p className="mt-2 text-xs text-rose-300">{t.lastError}: {row.last_error_code}</p>}
              <button className={`${btn} mt-3`} disabled={discovering === row.id} onClick={() => void discoverModels(row.id)}>
                {discovering === row.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {discovering === row.id ? t.discovering : t.discoverModels}
              </button>
            </div>
          ))}
          {providers.length === 0 && !loading && <p className="text-sm text-slate-400">{t.empty}</p>}
        </div>
      )}

      {section === 'models' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/60">
          <table className="min-w-full divide-y divide-slate-700/60">
            <thead className="bg-slate-900/80">
              <tr><th className={th}>{t.model}</th><th className={th}>{t.provider}</th><th className={th}>{t.enabled}</th><th className={th}>{t.context}</th><th className={th}>{t.verified}</th><th className={th}>{t.action}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {models.slice(0, 200).map((row) => {
                const key = row.provider_key + '::' + row.model_key;
                return (
                  <tr key={key}>
                    <td className={td}><code className="text-xs">{row.model_key}</code><div className="text-xs text-slate-400">{row.display_name}</div></td>
                    <td className={td}><code className="text-xs text-cyan-300">{row.provider_key}</code></td>
                    <td className={td}>{row.enabled ? '✓' : '✕'}</td>
                    <td className={td}>{row.context_window || '—'}</td>
                    <td className={td}>{fmtDateTime(row.verified_at, language)}</td>
                    <td className={td}>
                      <button className={btn} disabled={busyModel === key} onClick={() => void toggleModel(row.provider_key, row.model_key, !(row.enabled === true))}>
                        {busyModel === key ? <Loader2 size={13} className="animate-spin" /> : row.enabled ? <Ban size={13} /> : <CheckCircle2 size={13} />}
                        {row.enabled ? t.disable : t.enable}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {models.length === 0 && !loading && <p className="px-4 py-6 text-sm text-slate-400">{t.empty}</p>}
        </div>
      )}

      {(section === 'audit' || section === 'security') && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/60">
          <table className="min-w-full divide-y divide-slate-700/60">
            <thead className="bg-slate-900/80">
              {section === 'audit' ? (
                <tr><th className={th}>{t.when}</th><th className={th}>{t.actor}</th><th className={th}>{t.action}</th><th className={th}>{t.target}</th></tr>
              ) : (
                <tr><th className={th}>{t.when}</th><th className={th}>{t.eventType}</th><th className={th}>{t.severity}</th><th className={th}>request</th></tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {(section === 'audit' ? audit : security).slice(0, 150).map((row) => (
                section === 'audit' ? (
                  <tr key={row.id}>
                    <td className={td}>{fmtDateTime(row.created_at, language)}</td>
                    <td className={td}>{row.actor_email || row.actor_role || '—'}</td>
                    <td className={td}><code className="text-xs text-cyan-300">{row.action}</code></td>
                    <td className={td}><span className="text-xs text-slate-400">{row.target_type}/{row.target_id}</span></td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td className={td}>{fmtDateTime(row.created_at, language)}</td>
                    <td className={td}><code className="text-xs">{row.event_type}</code></td>
                    <td className={td}>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${row.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' : row.severity === 'warning' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700/60 text-slate-300'}`}>
                        {row.severity}
                      </span>
                    </td>
                    <td className={td}><span className="text-xs text-slate-500">{row.request_id ? row.request_id.slice(0, 8) : '—'}</span></td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
          {(section === 'audit' ? audit : security).length === 0 && !loading && <p className="px-4 py-6 text-sm text-slate-400">{t.empty}</p>}
        </div>
      )}
    </div>
  );
};

export default AfgAdminConsole;
