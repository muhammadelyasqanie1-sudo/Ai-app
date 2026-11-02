/** Minimal settings. Language switch flips document direction for RTL (Dari/Persian). */

import { useState } from 'react';
import { useWorkspace } from '../WorkspaceContext';
import Page from './Page';

export default function SettingsView() {
  const { model } = useWorkspace();
  const [lang, setLang] = useState<'en' | 'fa'>(document.documentElement.dir === 'rtl' ? 'fa' : 'en');

  const changeLang = (next: 'en' | 'fa') => {
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'fa' ? 'rtl' : 'ltr';
    // SETTINGS INJECTION POINT: persist the language preference.
  };

  return (
    <Page title="Settings">
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <label htmlFor="lang" className="text-sm font-medium">
            Language
          </label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => changeLang(e.target.value as 'en' | 'fa')}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          >
            <option value="en">English</option>
            <option value="fa">دری / فارسی</option>
          </select>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">Default model</span>
          <span className="font-mono text-sm text-slate-500">{model}</span>
        </div>
      </div>
    </Page>
  );
}
