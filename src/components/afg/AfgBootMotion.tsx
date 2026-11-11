import React, { useEffect, useState } from 'react';
import type { Language } from '../../types/afg';
import './AfgBootMotion.css';

const copy: Record<string, { status: string[]; tagline: string }> = {
  dari: {
    status: ['در حال راه‌اندازی هوش مصنوعی…', 'در حال آماده‌سازی محیط…', 'تقریباً آماده است…'],
    tagline: 'هوش مصنوعی افغانستان',
  },
  pashto: {
    status: ['مصنوعي ځیرکتیا پیلېږي…', 'چاپېریال چمتو کېږي…', 'نږدې چمتو دی…'],
    tagline: 'د افغانستان مصنوعي ځیرکتیا',
  },
  arabic: {
    status: ['جارٍ تشغيل الذكاء الاصطناعي…', 'جارٍ تجهيز مساحة العمل…', 'أوشكنا على الانتهاء…'],
    tagline: 'الذكاء الاصطناعي لأفغانستان',
  },
  english: {
    status: ['Initializing intelligence…', 'Preparing your workspace…', 'Almost ready…'],
    tagline: 'Afghanistan’s intelligent platform',
  },
};

export function AfgBootMotion({ language }: { language: Language }) {
  const locale = language === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english';
  const text = copy[locale];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((value) => (value + 1) % text.status.length), 1700);
    return () => window.clearInterval(timer);
  }, [text.status.length]);

  return (
    <main className="afg-boot" dir={locale === 'english' ? 'ltr' : 'rtl'} role="status" aria-live="polite">
      <div className="afg-boot-stars" aria-hidden="true" />
      <div className="afg-boot-grid" aria-hidden="true" />
      <div className="afg-boot-orbit afg-boot-orbit-one" aria-hidden="true" />
      <div className="afg-boot-orbit afg-boot-orbit-two" aria-hidden="true" />
      <div className="afg-boot-core-wrap" aria-hidden="true">
        <div className="afg-boot-halo" />
        <div className="afg-boot-core"><span>AFG</span><b>AI</b></div>
        <i className="afg-boot-spark afg-boot-spark-one" />
        <i className="afg-boot-spark afg-boot-spark-two" />
        <i className="afg-boot-spark afg-boot-spark-three" />
      </div>
      <section className="afg-boot-copy">
        <div className="afg-boot-wordmark">AFG <b>AI</b></div>
        <p>{text.tagline}</p>
        <div className="afg-boot-status"><span className="afg-boot-pulse" />{text.status[step]}</div>
        <div className="afg-boot-progress"><span /></div>
      </section>
      <small className="afg-boot-footer">ONE AI · MANY CAPABILITIES</small>
    </main>
  );
}
