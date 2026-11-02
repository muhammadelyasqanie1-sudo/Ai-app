/** Minimal settings. Switching language flips the document direction (RTL for Dari/Persian). */

import { useWorkspace } from '../WorkspaceContext';
import Page from './Page';

export default function SettingsView() {
  const { model, dir, setDir } = useWorkspace();
  // SETTINGS INJECTION POINT: persist the language preference.

  return (
    <Page title="Settings">
      <div className="divide-y divide-gray-100 rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <label htmlFor="lang" className="text-sm font-medium">
            Language
          </label>
          <select
            id="lang"
            value={dir === 'rtl' ? 'fa' : 'en'}
            onChange={(e) => setDir(e.target.value === 'fa' ? 'rtl' : 'ltr')}
            className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="en">English</option>
            <option value="fa">دری / فارسی</option>
          </select>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">Default model</span>
          <span className="font-mono text-sm text-gray-500">{model}</span>
        </div>
      </div>
    </Page>
  );
}
