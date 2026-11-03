import React, { useEffect, useRef, useState } from 'react';
import type { Language } from '../../types/afg';
import './AfgCinematicIntro.css';

interface AfgCinematicIntroProps {
  language: Language;
  onComplete: () => void;
}

const copy = {
  dari: {
    eyebrow: 'هوش مصنوعی نسل آینده',
    title: 'فراتر از',
    accent: 'تصور',
    line: 'یک جهان هوشمند؛ امکانات بی‌پایان.',
    loading: 'آماده‌سازی تجربه',
    enter: 'ورود به AFG AI',
    engine: 'موتور هوشمند',
    system: 'هسته سیستم',
    node: 'گره جهانی',
    status: 'وضعیت',
    capacity: 'ذرات فعال',
    latency: 'تأخیر شبکه',
    ready: 'آماده',
    connecting: 'در حال بررسی',
    offline: 'آفلاین',
  },
  english: {
    eyebrow: 'NEXT-GENERATION INTELLIGENCE',
    title: 'Beyond',
    accent: 'Imagination',
    line: 'One intelligent world. Limitless possibilities.',
    loading: 'Preparing your experience',
    enter: 'Enter AFG AI',
    engine: 'Neural Engine',
    system: 'Core System',
    node: 'Global Node',
    status: 'Status',
    capacity: 'Active particles',
    latency: 'Network latency',
    ready: 'READY',
    connecting: 'CHECKING',
    offline: 'OFFLINE',
  },
};

type NodeState = 'checking' | 'online' | 'offline';

export const AfgCinematicIntro: React.FC<AfgCinematicIntroProps> = ({ language, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [nodeState, setNodeState] = useState<NodeState>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const t = copy[language];
  const isRtl = language === 'dari';

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener?.('change', syncMotion);
    return () => media.removeEventListener?.('change', syncMotion);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) {
      setProgress(100);
      return;
    }

    let width = 0;
    let height = 0;
    let raf = 0;
    let lastArc = 0;
    let arcTarget = 0;
    let arcStart = 0;
    let angle = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = Array.from({ length: 5000 }, (_, index) => {
      const y = 1 - (index / 4999) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = Math.PI * (3 - Math.sqrt(5)) * index;
      return {
        x: Math.cos(theta) * radius,
        y,
        z: Math.sin(theta) * radius,
        seed: (index * 0.61803398875) % 1,
        size: 0.35 + ((index * 17) % 11) / 10,
      };
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const cx = width * 0.5;
      const cy = height * (width < 700 ? 0.445 : 0.49);
      const radius = Math.min(width * (width < 700 ? 0.285 : 0.19), height * 0.205);
      const pulse = 1 + Math.sin(time * 0.001) * 0.035;
      const rotation = reduced ? 0.28 : angle;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      const glow = context.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius * 2.25);
      glow.addColorStop(0, 'rgba(13,242,255,0.17)');
      glow.addColorStop(0.36, 'rgba(124,77,255,0.10)');
      glow.addColorStop(1, 'rgba(5,6,10,0)');
      context.fillStyle = glow;
      context.fillRect(cx - radius * 2.3, cy - radius * 2.3, radius * 4.6, radius * 4.6);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        const perspective = 1.15 / (1.7 - z * 0.42);
        const px = cx + x * radius * pulse * perspective;
        const py = cy + p.y * radius * pulse * perspective;
        const depth = (z + 1) * 0.5;
        const alpha = 0.18 + depth * 0.76;
        const dot = p.size * (0.55 + depth * 0.75);
        context.fillStyle = p.seed > 0.84
          ? `rgba(177,139,255,${alpha})`
          : `rgba(${depth > 0.68 ? '221,253,255' : '13,242,255'},${alpha})`;
        context.beginPath();
        context.arc(px, py, dot, 0, Math.PI * 2);
        context.fill();
      }

      // A fine energy filament periodically connects the core to an orbiting HUD.
      if (!reduced && time - lastArc > 3600) {
        lastArc = time;
        arcStart = time;
        arcTarget = (arcTarget + 1) % 3;
      }
      if (!reduced && time - arcStart < 430) {
        const targets = [
          [cx - radius * 1.85, cy - radius * 0.55],
          [cx + radius * 1.9, cy - radius * 0.2],
          [cx + radius * 0.2, cy + radius * 1.55],
        ];
        const [tx, ty] = targets[arcTarget];
        const fade = 1 - (time - arcStart) / 430;
        context.save();
        context.globalAlpha = fade * 0.75;
        context.strokeStyle = '#72f8ff';
        context.shadowColor = '#0df2ff';
        context.shadowBlur = 14;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(cx + (tx - cx) * 0.14, cy + (ty - cy) * 0.14);
        for (let step = 1; step < 8; step++) {
          const ratio = step / 8;
          const jitter = Math.sin(time * 0.04 + step * 8) * radius * 0.035;
          context.lineTo(cx + (tx - cx) * ratio + jitter, cy + (ty - cy) * ratio - jitter);
        }
        context.lineTo(tx, ty);
        context.stroke();
        context.restore();
      }

      if (!reduced) angle += 0.0019;
      if (!reduced) raf = window.requestAnimationFrame(draw);
    };

    resize();
    setProgress(28);
    window.addEventListener('resize', resize, { passive: true });
    raf = window.requestAnimationFrame(draw);

    const initialize = async () => {
      try {
        if ('fonts' in document) await document.fonts.ready;
      } catch { /* The system fallback font is ready to use. */ }
      setProgress(62);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      setProgress(100);
    };
    void initialize();

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);
    const base = String((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const started = performance.now();

    fetch(`${base}/api/capabilities`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!alive) return;
        const elapsed = Math.max(1, Math.round(performance.now() - started));
        setLatency(elapsed);
        setNodeState(response.ok && data?.verified === true ? 'online' : 'offline');
      })
      .catch(() => {
        if (alive) setNodeState('offline');
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const nodeLabel = nodeState === 'online' ? t.ready : nodeState === 'checking' ? t.connecting : t.offline;

  return (
    <main
      className={`afg-boot-screen ${reducedMotion ? 'is-reduced' : ''}`}
      lang={isRtl ? 'fa-AF' : 'en'}
      dir={isRtl ? 'rtl' : 'ltr'}
      aria-label="AFG AI cinematic welcome"
    >
      <canvas ref={canvasRef} className="afg-boot-canvas" aria-hidden="true" />
      <div className="afg-boot-grain" aria-hidden="true" />
      <div className="afg-boot-vignette" aria-hidden="true" />
      <div className="afg-boot-grid afg-boot-grid-ceiling" aria-hidden="true" />
      <div className="afg-boot-grid afg-boot-grid-floor" aria-hidden="true" />
      <div className="afg-boot-beams" aria-hidden="true"><i /><i /><i /><i /><i /></div>

      <header className="afg-boot-header">
        <div className="afg-boot-wordmark"><span className="afg-boot-mark">A</span><span>AFG <b>AI</b></span><small>INTELLIGENCE SYSTEM</small></div>
        <div className={`afg-boot-status state-${nodeState}`} aria-live="polite">
          <i />
          <span>{nodeState === 'online' ? 'GLOBAL NODE' : nodeState === 'checking' ? 'NODE CHECK' : 'LOCAL MODE'}</span>
          <b>{nodeLabel}</b>
          <em>{latency === null ? '—' : `${latency} ms`}</em>
        </div>
      </header>

      <section className="afg-boot-stage" aria-label="AFG AI intelligence core">
        <div className="afg-boot-scene">
          <svg className="afg-boot-circuit" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
            <path className="circuit-line" d="M170 145 H320 L420 235 H500 M830 145 H680 L580 235 H500 M170 415 H320 L420 325 H500 M830 415 H680 L580 325 H500"/>
            <circle cx="170" cy="145" r="5"/><circle cx="830" cy="145" r="5"/><circle cx="170" cy="415" r="5"/><circle cx="830" cy="415" r="5"/>
          </svg>
          <article className="afg-boot-panel panel-neural"><small>01 / THINK</small><strong>{t.engine}</strong><span className="afg-boot-panel-value">5,000 <i>●</i></span><span className="afg-boot-panel-caption">{t.capacity}</span></article>
          <article className="afg-boot-panel panel-create"><small>02 / CREATE</small><strong>{language === 'dari' ? 'آفرینش هوشمند' : 'Create'}</strong><span className="afg-boot-panel-value">GENERATIVE</span><span className="afg-boot-panel-caption">{language === 'dari' ? 'ایده تا نتیجه' : 'Ideas into reality'}</span></article>
          <div className="afg-boot-central"><div className="afg-boot-central-halo"/><div className="afg-boot-central-ring ring-one"/><div className="afg-boot-central-ring ring-two"/><div className="afg-boot-central-core"><span>AFG</span><b>AI</b></div><div className="afg-boot-core-label"><i/> AFG / CORE 01</div></div>
          <article className="afg-boot-panel panel-explore"><small>03 / EXPLORE</small><strong>{language === 'dari' ? 'کاوش جهان' : 'Explore'}</strong><span className="afg-boot-panel-value">∞ <i>●</i></span><span className="afg-boot-panel-caption">{language === 'dari' ? 'دانش بدون مرز' : 'Knowledge without limits'}</span></article>
          <article className="afg-boot-panel panel-live"><small>04 / LIVE</small><strong>{language === 'dari' ? 'هوش زنده' : 'Live Intelligence'}</strong><span className="afg-boot-panel-value">{nodeState === 'online' ? 'ONLINE' : nodeState === 'checking' ? 'SYNCING' : 'LOCAL'}</span><span className="afg-boot-panel-caption">{latency === null ? t.status : latency + ' ms · ' + t.latency}</span></article>
        </div>
        <div className="afg-boot-bottom">
          <section className="afg-boot-copy"><p className="afg-boot-eyebrow"><i/>{t.eyebrow}<i/></p><h1><span>{t.title}</span> <em>{t.accent}</em></h1><p className="afg-boot-tagline">{t.line}</p></section>
          <footer className="afg-boot-footer"><div className="afg-boot-progress-meta"><span>{t.loading}</span><b>{String(progress).padStart(2,'0')}%</b></div><div className="afg-boot-progress"><i style={{width:progress+'%'}}/></div><div className="afg-boot-footer-row"><span>BUILT FOR WHAT'S NEXT</span><span>AFGHANISTAN · GLOBAL INTELLIGENCE</span></div><button type="button" className="afg-boot-enter" onClick={onComplete} disabled={progress<100}><span>{t.enter}</span><b aria-hidden="true">↗</b></button></footer>
        </div>
      </section>
    </main>
  );
};
