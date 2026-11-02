/** Offline chat settings. Wire the toggle and model list to your on-device runtime. */

import { useState } from 'react';
import Page from './Page';

const LOCAL_MODELS = [
  { id: 'tiny', name: 'Tiny coder', size: '0.4 GB' },
  { id: 'small', name: 'Small assistant', size: '1.2 GB' },
];

export default function OfflineView() {
  const [enabled, setEnabled] = useState(false);

  return (
    <Page title="Offline Mode" subtitle="Chat without an internet connection using an on-device model.">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <div className="text-sm font-medium">Use offline model</div>
          <div className="text-xs text-slate-400" dir="rtl">
            چت آفلاین
          </div>
        </div>
        {/* STATE INJECTION POINT: persist this and route chat to the local runtime when on. */}
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Use offline model"
          onClick={() => setEnabled((v) => !v)}
          className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-blue-700' : 'bg-slate-300'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              enabled ? 'start-[22px]' : 'start-0.5'
            }`}
          />
        </button>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {LOCAL_MODELS.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-xs text-slate-400">{m.size}</div>
            </div>
            {/* DOWNLOAD INJECTION POINT */}
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Download
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
