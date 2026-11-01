import React, { useEffect, useState } from 'react';
import { ImageOff, ShieldCheck, RefreshCw } from 'lucide-react';
import type { Language } from '../../types/afg';

interface StudioProvider {
  providerId: string;
  modelId: string;
  displayName: string;
  stylePresets: Array<{ id: string; label: string }>;
  aspectRatios: string[];
  qualityLevels: string[];
  imageEdit: boolean;
}
interface StudioStatus {
  available: boolean;
  providers: StudioProvider[];
  message: string | null;
}
interface AfgImageGenViewProps { language: Language; }

export const AfgImageGenView: React.FC<AfgImageGenViewProps> = ({ language }) => {
  const dari = language === 'dari';
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/studio/capabilities');
      const data = await response.json();
      setStatus({
        available: response.ok && data.available === true,
        providers: Array.isArray(data.providers) ? data.providers : [],
        message: typeof data.message === 'string' ? data.message : null,
      });
    } catch {
      setStatus({ available: false, providers: [], message: null });
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <section className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="rounded-3xl border border-cyan-500/30 bg-slate-950/70 p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10">
            <ImageOff className="h-7 w-7 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{dari ? 'استودیوی تصویر' : 'Image Studio'}</h1>
            <p className="text-sm text-slate-400">{dari ? 'قابلیت‌ها فقط پس از تأیید واقعی ارائه‌دهنده نمایش داده می‌شوند.' : 'Only capabilities verified by a real provider are shown.'}</p>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-400">{dari ? 'در حال بررسی ارائه‌دهندگان...' : 'Checking configured providers...'}</p>
        ) : status?.available ? (
          <div className="mt-6 space-y-4">
            {status.providers.map((provider) => (
              <div key={provider.providerId + provider.modelId} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h2 className="font-semibold text-white">{provider.displayName}</h2>
                <p className="mt-1 text-xs text-slate-400">{provider.providerId} · {provider.modelId}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  {provider.stylePresets.map((preset) => <span key={preset.id} className="rounded-lg bg-slate-800 px-2 py-1">{preset.label}</span>)}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {dari ? 'نسبت تصویر' : 'Aspect ratios'}: {provider.aspectRatios.join(', ')} · {dari ? 'کیفیت' : 'Quality'}: {provider.qualityLevels.join(', ')}
                </p>
                <p className="mt-1 text-xs text-slate-400">{dari ? 'ویرایش تصویر' : 'Image editing'}: {provider.imageEdit ? (dari ? 'پشتیبانی می‌شود' : 'Supported') : (dari ? 'پشتیبانی نمی‌شود' : 'Not supported')}</p>
              </div>
            ))}
            <p className="text-sm text-amber-200">{dari ? 'رابط تولید تصویر تا اتصال امن ذخیره‌سازی و پیاده‌سازی عملیات تولید فعال نمی‌شود.' : 'The generation workflow remains unavailable until secure asset storage and generation operations are implemented.'}</p>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5 text-center">
            <ShieldCheck className="mx-auto h-9 w-9 text-amber-300" />
            <h2 className="mt-3 font-semibold text-white">{dari ? 'ارائه‌دهنده تأییدشده تولید تصویر موجود نیست' : 'No verified image-generation provider is available'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {status?.message || (dari ? 'هیچ مدل متصل، قابلیت تولید تصویر را اعلام نکرده است.' : 'No connected model currently declares verified image-generation support.')}
            </p>
            <button onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-xs text-slate-200">
              <RefreshCw className="h-3.5 w-3.5" />{dari ? 'بررسی دوباره' : 'Check again'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
