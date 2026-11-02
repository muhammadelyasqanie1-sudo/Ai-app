import React, { useEffect, useState } from 'react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { Language } from '../../types/afg';

interface AfgCinematicIntroProps {
  language: Language;
  onComplete: () => void;
}

const copy = {
  dari: {
    eyebrow: 'هوش مصنوعی نسل آینده',
    title: 'فراتر از',
    accent: 'تصور',
    line: 'یک جهان هوشمند. یک تجربه بی‌مرز.',
    loading: 'در حال آماده‌سازی تجربه شما',
    enter: 'ورود به AFG AI',
  },
  english: {
    eyebrow: 'NEXT-GENERATION INTELLIGENCE',
    title: 'Beyond',
    accent: 'Imagination',
    line: 'One intelligent world. Limitless possibilities.',
    loading: 'Preparing your experience',
    enter: 'Enter AFG AI',
  },
};

export const AfgCinematicIntro: React.FC<AfgCinematicIntroProps> = ({ language, onComplete }) => {
  const [phase, setPhase] = useState<'arrival' | 'reveal' | 'exit'>('arrival');
  const [progress, setProgress] = useState(0);
  const t = copy[language];

  useEffect(() => {
    const reveal = window.setTimeout(() => setPhase('reveal'), 650);
    const finish = window.setTimeout(() => setPhase('exit'), 3900);
    const complete = window.setTimeout(onComplete, 4550);
    const progressTimer = window.setInterval(() => setProgress(value => Math.min(100, value + 2)), 82);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(finish);
      window.clearTimeout(complete);
      window.clearInterval(progressTimer);
    };
  }, [onComplete]);

  return (
    <main className={`afg-cinematic-intro phase-${phase}`} lang={language === 'dari' ? 'fa-AF' : 'en'} dir={language === 'dari' ? 'rtl' : 'ltr'} aria-label="AFG AI intro">
      <div className="afg-intro-grain" aria-hidden="true" />
      <div className="afg-intro-grid" aria-hidden="true" />
      <div className="afg-intro-vignette" aria-hidden="true" />
      <div className="afg-intro-orbit orbit-one" aria-hidden="true" />
      <div className="afg-intro-orbit orbit-two" aria-hidden="true" />
      <div className="afg-intro-orbit orbit-three" aria-hidden="true" />
      <div className="afg-intro-particles" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--particle-index': i } as React.CSSProperties} />)}
      </div>

      <div className="afg-intro-topline">
        <span className="afg-intro-live-dot" />
        <span>AFG AI</span>
        <span className="afg-intro-topline-rule" />
        <span className="afg-intro-topline-meta">INTELLIGENCE / 01</span>
      </div>

      <section className="afg-intro-stage">
        <div className="afg-intro-halo" aria-hidden="true" />
        <div className="afg-intro-ring ring-a" aria-hidden="true" />
        <div className="afg-intro-ring ring-b" aria-hidden="true" />
        <div className="afg-intro-ring ring-c" aria-hidden="true" />
        <div className="afg-intro-core">
          <div className="afg-intro-core-glow" />
          <AfgBrainLogo size="xl" showBadge={false} className="afg-intro-logo" />
          <span className="afg-intro-core-scan" />
        </div>

        <div className="afg-intro-glass-card card-left" aria-hidden="true">
          <span className="afg-intro-card-index">01 / THINK</span>
          <span className="afg-intro-card-symbol">✳</span>
          <span className="afg-intro-card-caption">NEURAL ENGINE</span>
        </div>
        <div className="afg-intro-glass-card card-right" aria-hidden="true">
          <span className="afg-intro-card-index">02 / CREATE</span>
          <span className="afg-intro-card-symbol">⌘</span>
          <span className="afg-intro-card-caption">CREATIVE STUDIO</span>
        </div>
        <div className="afg-intro-glass-card card-bottom" aria-hidden="true">
          <span className="afg-intro-card-index">03 / EXPLORE</span>
          <span className="afg-intro-card-caption">A WORLD OF POSSIBILITIES</span>
          <span className="afg-intro-card-bars"><i /><i /><i /><i /><i /><i /><i /></span>
        </div>
        <div className="afg-intro-crosshair crosshair-one" aria-hidden="true">+</div>
        <div className="afg-intro-crosshair crosshair-two" aria-hidden="true">+</div>
      </section>

      <section className="afg-intro-copy">
        <p className="afg-intro-eyebrow"><span />{t.eyebrow}<span /></p>
        <h1><span>{t.title}</span> <em>{t.accent}</em></h1>
        <p className="afg-intro-tagline">{t.line}</p>
      </section>

      <footer className="afg-intro-footer">
        <div className="afg-intro-progress-copy">
          <span>{t.loading}</span><span>{String(progress).padStart(2, '0')}%</span>
        </div>
        <div className="afg-intro-progress-track"><span style={{ width: progress + '%' }} /></div>
        <div className="afg-intro-footer-bottom">
          <span>BUILT FOR WHAT'S NEXT</span>
          <span>AFGHANISTAN · GLOBAL</span>
        </div>
      </footer>
      <button type="button" className="afg-intro-skip" onClick={onComplete}>{t.enter}<span>↗</span></button>
    </main>
  );
};
