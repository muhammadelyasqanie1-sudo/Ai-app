import React from 'react';
import { ImageOff, ShieldCheck } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgImageGenViewProps {
  language: Language;
}

export const AfgImageGenView: React.FC<AfgImageGenViewProps> = ({ language }) => {
  const dari = language === 'dari';
  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-3xl border border-cyan-500/30 bg-slate-950/70 p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10">
          <ImageOff className="h-8 w-8 text-cyan-300" />
        </div>
        <h1 className="text-2xl font-black text-white">{dari ? 'تولید تصویر هوش مصنوعی' : 'AI Image Generation'}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          {dari
            ? 'این قابلیت تا زمانی که یک ارائه‌دهنده واقعی تولید تصویر به سرور وصل و تأیید نشود، غیرفعال است. هیچ تصویر نمونه‌ای به‌عنوان تصویر تولیدشده نمایش داده نمی‌شود.'
            : 'This capability stays disabled until a real image-generation provider is connected and verified by the backend. Sample images will never be presented as generated results.'}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200">
          <ShieldCheck className="h-4 w-4" />
          {dari ? 'ارائه‌دهنده تولید تصویر تنظیم نشده است' : 'No image provider is configured'}
        </div>
      </div>
    </section>
  );
};
