import React from 'react';
import { VideoOff, ShieldCheck } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgVideoGenViewProps {
  language: Language;
}

export const AfgVideoGenView: React.FC<AfgVideoGenViewProps> = ({ language }) => {
  const dari = language === 'dari';
  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-3xl border border-purple-500/30 bg-slate-950/70 p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-400/30 bg-purple-400/10">
          <VideoOff className="h-8 w-8 text-purple-300" />
        </div>
        <h1 className="text-2xl font-black text-white">{dari ? 'تولید ویدیو با هوش مصنوعی' : 'AI Video Generation'}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          {dari
            ? 'این قابلیت تا زمانی که یک ارائه‌دهنده واقعی تولید ویدیو به سرور وصل و تأیید نشود، غیرفعال است. ویدیوهای نمونه یا نمایشی به‌عنوان خروجی تولیدشده نشان داده نمی‌شوند.'
            : 'This capability stays disabled until a real video-generation provider is connected and verified by the backend. Demo videos will never be shown as generated output.'}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200">
          <ShieldCheck className="h-4 w-4" />
          {dari ? 'ارائه‌دهنده تولید ویدیو تنظیم نشده است' : 'No video provider is configured'}
        </div>
      </div>
    </section>
  );
};
