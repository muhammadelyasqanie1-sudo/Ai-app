/** Image / video generation. Calls generateMedia() in api.ts. */

import { useState } from 'react';
import { generateMedia } from '../api';
import Page from './Page';

export default function MediaView() {
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      // API INJECTION POINT: real generation. Render `url` when the API returns one.
      const r = await generateMedia(kind, prompt.trim());
      setResult(r.note);
    } catch {
      setResult('Generation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Image & Video" subtitle="Describe what you want to create.">
      <div role="tablist" className="grid w-48 grid-cols-2 rounded-xl bg-slate-200/60 p-1 text-sm">
        {(['image', 'video'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-lg py-1.5 font-medium capitalize ${
              kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        dir="auto"
        placeholder={`Describe the ${kind}`}
        aria-label="Prompt"
        className="mt-4 w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
      />

      <button
        onClick={generate}
        disabled={!prompt.trim() || busy}
        className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400"
      >
        {busy ? 'Generating…' : 'Generate'}
      </button>

      {result && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500" dir="auto">
          {result}
        </div>
      )}
    </Page>
  );
}
