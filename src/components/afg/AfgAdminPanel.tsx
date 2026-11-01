import React from 'react';
import { ShieldAlert, LockKeyhole } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgAdminPanelProps {
  language: Language;
}

export const AfgAdminPanel: React.FC<AfgAdminPanelProps> = ({ language }) => {
  const dari = language === 'dari';
  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-3xl border border-amber-500/30 bg-slate-950/70 p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
          <ShieldAlert className="h-8 w-8 text-amber-300" />
        </div>
        <h1 className="text-2xl font-black text-white">
          {dari ? 'پنل مدیریت' : 'Administration'}
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          {dari
            ? 'پنل مدیریت تا زمان پیاده‌سازی ورود امن، نقش‌های تأییدشده و مجوزدهی سمت سرور غیرفعال است. آمار یا کلیدهای کنترلی نمایشی نشان داده نمی‌شود.'
            : 'The admin panel is disabled until secure sign-in, verified roles, and server-side authorization are implemented. No sample metrics or client-only control switches are shown.'}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200">
          <LockKeyhole className="h-4 w-4" />
          {dari ? 'احراز هویت و مجوز مدیریت تنظیم نشده است' : 'Authentication and admin authorization are not configured'}
        </div>
      </div>
    </section>
  );
};
