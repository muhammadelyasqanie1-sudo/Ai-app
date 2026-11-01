import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, LockKeyhole, RefreshCw, Save, Power, LogOut } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgAdminPanelProps { language: Language; }
type ProviderRow = { id: string; displayName: string; enabled: boolean; configured: boolean; };
type ModelRow = {
  id: string; providerId: string; displayName: string; description: string;
  contextWindow: number; enabled: boolean; verifiedAt: string | null;
  inputCostPerMillion: number | null; outputCostPerMillion: number | null;
  capabilities: Record<string, boolean>;
};
type FallbackRow = { capability: string; ordered_models: string[] | string; };

const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

function csrfCookie(): string {
  const match = document.cookie.split('; ').find((item) => item.startsWith('afg_csrf='));
  return match ? decodeURIComponent(match.slice('afg_csrf='.length)) : '';
}

async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrfCookie());
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export const AfgAdminPanel: React.FC<AfgAdminPanelProps> = ({ language }) => {
  const dari = language === 'dari';
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [displayName, setDisplayName] = useState('AFG AI Administrator');
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [fallbacks, setFallbacks] = useState<FallbackRow[]>([]);
  const [fallbackCapability, setFallbackCapability] = useState('text');
  const [fallbackText, setFallbackText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [providerData, modelData, fallbackData] = await Promise.all([
        api('/api/admin/providers'), api('/api/admin/models'), api('/api/admin/fallbacks'),
      ]);
      setProviders(providerData.providers || []);
      setModels(modelData.models || []);
      setFallbacks(fallbackData.fallbacks || []);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin settings.');
      setAuthenticated(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    api('/api/auth/me').then((data) => {
      if (data.authenticated && data.user?.role === 'admin') void loadAdminData();
    }).catch(() => {});
  }, [loadAdminData]);

  const signIn = async (bootstrap: boolean) => {
    setLoading(true); setError(''); setNotice('');
    try {
      await api(bootstrap ? '/api/auth/bootstrap-admin' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(bootstrap
          ? { email, password, displayName, bootstrapToken }
          : { email, password }),
      });
      setBootstrapToken('');
      await loadAdminData();
      setNotice(dari ? 'ورود مدیر موفق بود.' : 'Administrator session established.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally { setLoading(false); }
  };

  const toggleProvider = async (provider: ProviderRow) => {
    setError('');
    try {
      await api('/api/admin/providers', { method: 'PATCH', body: JSON.stringify({ providerId: provider.id, enabled: !provider.enabled }) });
      await loadAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Provider update failed.'); }
  };

  const toggleModel = async (model: ModelRow) => {
    setError('');
    try {
      await api('/api/admin/models', {
        method: 'PATCH',
        body: JSON.stringify({
          providerId: model.providerId, modelId: model.id, enabled: !model.enabled,
          inputCostPerMillion: model.inputCostPerMillion,
          outputCostPerMillion: model.outputCostPerMillion,
        }),
      });
      await loadAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Model update failed.'); }
  };

  const saveFallback = async () => {
    setError('');
    try {
      const orderedModels = fallbackText.split('\n').map((item) => item.trim()).filter(Boolean);
      await api('/api/admin/fallbacks', {
        method: 'PATCH', body: JSON.stringify({ capability: fallbackCapability, orderedModels }),
      });
      await loadAdminData();
      setNotice(dari ? 'زنجیره جایگزین ذخیره شد.' : 'Fallback order saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Fallback update failed.'); }
  };

  const selectFallback = (capability: string) => {
    setFallbackCapability(capability);
    const item = fallbacks.find((entry) => entry.capability === capability);
    const value = Array.isArray(item?.ordered_models) ? item?.ordered_models : [];
    setFallbackText(value.join('\n'));
  };

  const signOut = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    setAuthenticated(false); setProviders([]); setModels([]);
  };

  if (!authenticated) {
    return (
      <section className="w-full max-w-xl mx-auto px-4 py-10">
        <div className="rounded-3xl border border-amber-500/30 bg-slate-950/80 p-6 sm:p-8 shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
            <LockKeyhole className="h-7 w-7 text-amber-300" />
          </div>
          <h1 className="text-center text-2xl font-black text-white">{dari ? 'ورود مدیر AFG AI' : 'AFG AI Admin Sign-in'}</h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            {dari ? 'برای مدیریت Provider و مدل‌ها، حساب مدیر لازم است.' : 'A verified administrator account is required to manage providers and models.'}
          </p>
          <div className="mt-6 space-y-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="Email" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={showBootstrap ? 'new-password' : 'current-password'} placeholder={dari ? 'رمز عبور' : 'Password'} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400" />
            {showBootstrap && <>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Administrator name" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              <input value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} type="password" autoComplete="off" placeholder="One-time bootstrap token" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              <p className="text-xs text-amber-200/80">{dari ? 'توکن باید در متغیر سرور AFG_ADMIN_BOOTSTRAP_TOKEN تنظیم شده باشد. فقط برای ایجاد نخستین مدیر استفاده می‌شود.' : 'The server must have AFG_ADMIN_BOOTSTRAP_TOKEN configured. This can create the first administrator only.'}</p>
            </>}
            <button onClick={() => void signIn(showBootstrap)} disabled={loading || !email || !password || (showBootstrap && !bootstrapToken)} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">
              {loading ? '…' : showBootstrap ? (dari ? 'ایجاد مدیر نخستین' : 'Bootstrap first administrator') : (dari ? 'ورود' : 'Sign in')}
            </button>
            <button onClick={() => setShowBootstrap((value) => !value)} className="w-full py-2 text-xs text-cyan-300 underline">
              {showBootstrap ? (dari ? 'بازگشت به ورود' : 'Back to sign in') : (dari ? 'ایجاد نخستین مدیر' : 'Set up the first administrator')}
            </button>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-cyan-400" />{dari ? 'کنترول Provider و مدل‌ها' : 'Provider & Model Control'}</h1>
          <p className="mt-1 text-xs text-slate-400">{dari ? 'تغییرات در دیتابیس ذخیره و ثبت رویداد می‌شوند.' : 'Changes are persisted in PostgreSQL and recorded in the audit log.'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadAdminData()} className="rounded-xl border border-slate-700 p-2 text-slate-300" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => void signOut()} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 flex items-center gap-2"><LogOut className="w-4 h-4" />{dari ? 'خروج' : 'Sign out'}</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <h2 className="font-bold text-white">{dari ? 'ارائه‌دهندگان' : 'Providers'}</h2>
        {providers.map((provider) => <div key={provider.id} className="flex items-center justify-between gap-3 border-t border-slate-800 py-3">
          <div><p className="text-sm font-semibold text-white">{provider.displayName}</p><p className="text-xs text-slate-500">{provider.id}</p></div>
          <button onClick={() => void toggleProvider(provider)} className={`rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-2 ${provider.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}><Power className="w-4 h-4" />{provider.enabled ? 'Enabled' : 'Disabled'}</button>
        </div>)}
        {providers.length === 0 && <p className="text-sm text-slate-500">{loading ? 'Loading…' : 'No registered providers.'}</p>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <h2 className="font-bold text-white">{dari ? 'مدل‌ها' : 'Discovered models'}</h2>
        {models.map((model) => <div key={model.providerId + ':' + model.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 py-3">
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-semibold text-white">{model.displayName}</p>
            <p className="text-[11px] text-slate-500">{model.providerId} · {model.contextWindow ? `${model.contextWindow.toLocaleString()} context` : 'Context unknown'}</p>
            <div className="mt-1 flex flex-wrap gap-1">{Object.entries(model.capabilities).filter(([, value]) => value).map(([key]) => <span key={key} className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">{key}</span>)}</div>
            <p className={`mt-1 text-[11px] ${model.verifiedAt ? 'text-emerald-400' : 'text-amber-300'}`}>{model.verifiedAt ? `Verified ${new Date(model.verifiedAt).toLocaleString()}` : 'Provider not reachable.'}</p>
          </div>
          <button onClick={() => void toggleModel(model)} className={`rounded-xl px-3 py-2 text-xs font-bold ${model.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{model.enabled ? 'Enabled' : 'Disabled'}</button>
        </div>)}
        {models.length === 0 && <p className="text-sm text-slate-500">{loading ? 'Loading…' : 'No discovered models. Configure the provider on the server.'}</p>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
        <h2 className="font-bold text-white">{dari ? 'زنجیره جایگزین قابلیت‌ها' : 'Capability fallback chains'}</h2>
        <select value={fallbackCapability} onChange={(e) => selectFallback(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
          {['text','vision','imageGen','tts','stt'].map((cap) => <option key={cap} value={cap}>{cap}</option>)}
        </select>
        <textarea value={fallbackText} onChange={(e) => setFallbackText(e.target.value)} rows={4} placeholder="One model ID per line, in fallback order" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-white" />
        <p className="text-[11px] text-slate-500">Use discovered model IDs, one per line. The first healthy model in this order is preferred.</p>
        <button onClick={() => void saveFallback()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 flex items-center gap-2"><Save className="w-4 h-4" />Save fallback order</button>
      </div>
    </section>
  );
};
