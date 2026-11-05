import React, { useMemo, useState } from 'react';
import { Image, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import type { AfgModelOption, Language } from '../../types/afg';

interface AfgImageGenViewProps {
  language: Language;
  selectedModel?: string;
  modelOptions?: AfgModelOption[];
}

export const AfgImageGenView: React.FC<AfgImageGenViewProps> = ({ language, selectedModel = 'auto', modelOptions = [] }) => {
  const dari = language !== 'english';
  const imageModels = useMemo(() => modelOptions.filter(model => model.selectable && model.capabilities?.imageGen), [modelOptions]);
  const selected = imageModels.find(model => selectedModel === model.providerId + '::' + model.id) || imageModels[0] || null;
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('standard');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const generate = async () => {
    if (!selected) { setError(dari ? 'مدل فعال تولید تصویر موجود نیست.' : 'No enabled image model is available.'); return; }
    if (selected.providerId !== '9router') {
      setError(dari ? 'این مدل در فهرست است؛ اما مسیر تولید آن هنوز به ارائه‌دهنده وصل نشده است.' : 'This model is listed, but its provider image-generation route is not integrated yet.');
      return;
    }
    if (!prompt.trim()) { setError(dari ? 'توضیح تصویر را بنویسید.' : 'Enter an image prompt.'); return; }
    setBusy(true); setError(''); setImages([]);
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/9router/images/generations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selected.id, prompt: prompt.trim(), n: count, size, quality, response_format: 'url' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (dari ? 'تولید تصویر ناموفق بود.' : 'Image generation failed.'));
      const rows = Array.isArray(data.data) ? data.data : [];
      const output = rows.map((item: any) => item.url || (item.b64_json ? 'data:image/png;base64,' + item.b64_json : '')).filter(Boolean);
      if (!output.length) throw new Error(dari ? 'ارائه‌دهنده تصویر قابل نمایش برنگرداند.' : 'The provider returned no displayable image output.');
      setImages(output);
    } catch (err) {
      setError(err instanceof Error ? err.message : (dari ? 'خطای تولید تصویر.' : 'Image generation error.'));
    } finally { setBusy(false); }
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
      <div className="rounded-3xl border border-cyan-500/30 bg-slate-950/80 p-5 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10"><Image className="h-6 w-6 text-cyan-300"/></div>
          <div><h1 className="text-2xl font-black text-white">{dari ? 'گروه مدل‌های تصویر' : 'Image models'}</h1><p className="text-sm text-slate-400">{dari ? 'مدل انتخاب‌شده از گروه تصویر برای تولید استفاده می‌شود.' : 'The selected image-group model is used for generation.'}</p></div>
        </div>
        <div className="mt-5 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">{dari ? 'مدل تصویر' : 'Image model'}</label>
          <select className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white" value={selected ? selected.providerId + '::' + selected.id : ''} onChange={(event) => {
            const chosen = imageModels.find(model => model.providerId + '::' + model.id === event.target.value);
            if (chosen) window.dispatchEvent(new CustomEvent('afg-select-model', { detail: chosen.providerId + '::' + chosen.id }));
          }}>
            {imageModels.map(model => <option key={model.providerId + '::' + model.id} value={model.providerId + '::' + model.id}>{model.displayName} · {model.providerId}</option>)}
          </select>
          {selected && <p className="break-all text-[10px] text-slate-500">{selected.id}</p>}
          <label className="block text-xs font-semibold text-slate-300">{dari ? 'توضیح تصویر' : 'Image prompt'}</label>
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-none focus:border-cyan-400" placeholder={dari ? 'تصویری را که می‌خواهید بسازید توصیف کنید...' : 'Describe the image you want to create...'} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-400">{dari ? 'اندازه' : 'Size'}<select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-sm text-white" value={size} onChange={event => setSize(event.target.value)}><option>1024x1024</option><option>1024x1536</option><option>1536x1024</option></select></label>
            <label className="text-xs text-slate-400">{dari ? 'کیفیت' : 'Quality'}<select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-sm text-white" value={quality} onChange={event => setQuality(event.target.value)}><option value="standard">Standard</option><option value="high">High</option><option value="low">Low</option></select></label>
            <label className="text-xs text-slate-400">{dari ? 'تعداد' : 'Count'}<select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-sm text-white" value={count} onChange={event => setCount(Number(event.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
          </div>
          <button type="button" onClick={() => void generate()} disabled={busy || !selected || !prompt.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{busy ? (dari ? 'در حال تولید...' : 'Generating...') : (dari ? 'تولید تصویر' : 'Generate image')}
          </button>
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
          {images.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{images.map((src, index) => <img key={index} src={src} alt={'Generated image ' + (index + 1)} className="w-full rounded-2xl border border-slate-700 object-contain"/>)}</div>}
          {!imageModels.length && <p className="text-xs text-amber-200">{dari ? 'مدل تصویر فعال و تأییدشده در فهرست مرکزی پیدا نشد. ابتدا مدل‌ها را در مدیریت کشف و فعال کنید.' : 'No enabled image model is in the central catalogue. Discover and enable image models in Admin first.'}</p>}
        </div>
      </div>
    </section>
  );
};
