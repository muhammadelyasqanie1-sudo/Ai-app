/** AI providers and connection state. Data comes from listProviders() in api.ts. */

import { useEffect, useState } from 'react';
import { listProviders, type ProviderInfo } from '../api';
import Page from './Page';

export default function ProvidersView() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // API INJECTION POINT: real providers + connection status.
    listProviders().then((p) => {
      if (!cancelled) setProviders(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Page title="Providers" subtitle="Choose which AI services the workspace can use.">
      {providers === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {providers.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="font-mono text-xs text-slate-400">{p.model}</div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  p.connected ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {p.connected ? 'Connected' : 'Not connected'}
              </span>
              {/* API INJECTION POINT: connect / disconnect + API key entry. */}
              <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {p.connected ? 'Manage' : 'Connect'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
