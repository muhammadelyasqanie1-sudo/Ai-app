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
    title: 'آغاز یک',
    accent: 'تحول...',
    line: 'یک هوش مصنوعی، توانایی‌های بسیار، یک پلتفرم هوشمند.',
    loading: 'آماده‌سازی تجربه',
    enter: 'ورود به AFG AI',
    engine: 'موتور هوشمند',
    create: 'آفرینش هوشمند',
    explore: 'کاوش جهان',
    live: 'هوش زنده',
    capacity: 'گره‌های عصبی',
    latency: 'زمان پاسخ API',
    ready: 'آماده',
    connecting: 'در حال بررسی',
    offline: 'تأییدنشده',
    apiStatus: 'وضعیت API',
    soundOn: 'فعال‌کردن صدای ورود',
    soundOff: 'خاموش‌کردن صدای ورود',
    soundEnabled: 'صدا روشن',
    soundDisabled: 'صدا خاموش',
  },
  english: {
    eyebrow: 'NEXT-GENERATION INTELLIGENCE',
    title: 'A New',
    accent: 'Era Begins...',
    line: 'One AI. Many capabilities. One intelligent platform.',
    loading: 'Preparing your experience',
    enter: 'Enter AFG AI',
    engine: 'Neural Engine',
    create: 'Intelligent Creation',
    explore: 'Explore',
    live: 'Live Intelligence',
    capacity: 'Neural nodes',
    latency: 'API response',
    ready: 'READY',
    connecting: 'CHECKING',
    offline: 'UNVERIFIED',
    apiStatus: 'API STATUS',
    soundOn: 'Enable welcome sound',
    soundOff: 'Mute welcome sound',
    soundEnabled: 'SOUND ON',
    soundDisabled: 'SOUND OFF',
  },
};

type NodeState = 'checking' | 'online' | 'offline';

type NetworkNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  gold: boolean;
};

const RTL_LANGUAGES: Language[] = ['dari', 'persian', 'pashto', 'arabic', 'urdu'];

export const AfgCinematicIntro: React.FC<AfgCinematicIntroProps> = ({ language, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [progress, setProgress] = useState(0);
  const [nodeState, setNodeState] = useState<NodeState>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const t = language === 'english' ? copy.english : copy.dari;
  const isRtl = RTL_LANGUAGES.includes(language);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener?.('change', syncMotion);
    return () => media.removeEventListener?.('change', syncMotion);
  }, []);

  // Lightweight canvas scene: a living neural network, floating sparks and a warm
  // golden ignition point. Particle counts stay bounded for mid-range Android devices.
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
    let visible = !document.hidden;
    let lastTime = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes: NetworkNode[] = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00016,
      vy: (Math.random() - 0.5) * 0.00016,
      radius: 0.7 + Math.random() * 1.25,
      phase: Math.random() * Math.PI * 2,
    }));
    const sparks: Spark[] = Array.from({ length: 80 }, () => {
      const life = 0.35 + Math.random() * 0.65;
      return {
        x: 0.5 + (Math.random() - 0.5) * 0.2,
        y: 0.5 + (Math.random() - 0.5) * 0.2,
        vx: (Math.random() - 0.5) * 0.0009,
        vy: (Math.random() - 0.5) * 0.0009,
        radius: 0.6 + Math.random() * 1.7,
        life,
        maxLife: life,
        gold: Math.random() > 0.72,
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
      if (reduced) draw(0, false);
    };

    const draw = (time: number, animate = true) => {
      context.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * (width < 700 ? 0.43 : 0.47);
      const pulse = animate && !reduced ? 0.5 + 0.5 * Math.sin(time * 0.0017) : 0.65;
      const coreRadius = Math.min(48, Math.max(25, Math.min(width, height) * 0.045)) + pulse * 12;

      // Deep, restrained gold/cyan illumination behind the AFG AI core.
      const halo = context.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 5.2);
      halo.addColorStop(0, `rgba(255,184,107,${0.13 + pulse * 0.08})`);
      halo.addColorStop(0.32, 'rgba(13,242,255,0.055)');
      halo.addColorStop(0.68, 'rgba(124,77,255,0.035)');
      halo.addColorStop(1, 'rgba(5,6,10,0)');
      context.fillStyle = halo;
      context.fillRect(cx - coreRadius * 5.2, cy - coreRadius * 5.2, coreRadius * 10.4, coreRadius * 10.4);

      if (animate && !reduced) {
        for (const node of nodes) {
          node.x += node.vx;
          node.y += node.vy;
          if (node.x < -0.02) node.x = 1.02;
          if (node.x > 1.02) node.x = -0.02;
          if (node.y < -0.02) node.y = 1.02;
          if (node.y > 1.02) node.y = -0.02;
        }
      }

      const maxDistance = Math.min(width, height) * 0.235;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const ax = a.x * width;
        const ay = a.y * height;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = ax - b.x * width;
          const dy = ay - b.y * height;
          const distance = Math.hypot(dx, dy);
          if (distance >= maxDistance) continue;
          const alpha = (1 - distance / maxDistance) * 0.22;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(b.x * width, b.y * height);
          context.strokeStyle = `rgba(13,242,255,${alpha * (0.65 + pulse * 0.35)})`;
          context.lineWidth = 0.55;
          context.stroke();
        }
      }

      for (const node of nodes) {
        const x = node.x * width;
        const y = node.y * height;
        const twinkle = animate && !reduced ? 0.5 + 0.5 * Math.sin(time * 0.0025 + node.phase) : 0.6;
        context.beginPath();
        context.arc(x, y, node.radius * (1.5 + twinkle), 0, Math.PI * 2);
        context.fillStyle = `rgba(13,242,255,${0.12 + twinkle * 0.14})`;
        context.fill();
        context.beginPath();
        context.arc(x, y, node.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(174,247,255,${0.42 + twinkle * 0.42})`;
        context.fill();
      }

      // A warm central ignition with fine rays, echoing the supplied scene.
      const core = context.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
      core.addColorStop(0, `rgba(255,247,215,${0.78 + pulse * 0.18})`);
      core.addColorStop(0.22, `rgba(255,218,137,${0.5 + pulse * 0.25})`);
      core.addColorStop(0.58, `rgba(255,184,107,${0.16 + pulse * 0.1})`);
      core.addColorStop(1, 'rgba(255,184,107,0)');
      context.fillStyle = core;
      context.beginPath();
      context.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      context.fill();

      context.save();
      context.translate(cx, cy);
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + (animate && !reduced ? time * 0.00012 : 0);
        const rayLength = coreRadius * (1.7 + pulse * 0.9);
        context.beginPath();
        context.moveTo(Math.cos(angle) * coreRadius * 0.35, Math.sin(angle) * coreRadius * 0.35);
        context.lineTo(Math.cos(angle) * rayLength, Math.sin(angle) * rayLength);
        context.strokeStyle = `rgba(255,210,132,${0.035 + pulse * 0.045})`;
        context.lineWidth = 1;
        context.stroke();
      }
      context.restore();

      if (animate && !reduced) {
        for (const spark of sparks) {
          spark.x += spark.vx;
          spark.y += spark.vy;
          spark.life -= 0.0018;
          if (spark.life <= 0 || spark.x < -0.05 || spark.x > 1.05 || spark.y < -0.05 || spark.y > 1.05) {
            spark.x = 0.5 + (Math.random() - 0.5) * 0.24;
            spark.y = 0.5 + (Math.random() - 0.5) * 0.24;
            spark.vx = (Math.random() - 0.5) * 0.0009;
            spark.vy = (Math.random() - 0.5) * 0.0009;
            spark.life = spark.maxLife = 0.35 + Math.random() * 0.65;
            spark.gold = Math.random() > 0.72;
          }
        }
      }

      for (const spark of sparks) {
        const alpha = Math.max(0, spark.life / spark.maxLife) * 0.62;
        context.beginPath();
        context.arc(spark.x * width, spark.y * height, spark.radius, 0, Math.PI * 2);
        context.fillStyle = spark.gold
          ? `rgba(255,184,107,${alpha})`
          : `rgba(13,220,245,${alpha})`;
        context.fill();
      }
    };

    const frame = (time: number) => {
      if (!visible) return;
      if (!lastTime || time - lastTime >= 28) {
        draw(time);
        lastTime = time;
      }
      raf = window.requestAnimationFrame(frame);
    };
    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (visible && !reduced) {
        lastTime = 0;
        raf = window.requestAnimationFrame(frame);
      } else {
        window.cancelAnimationFrame(raf);
      }
    };

    resize();
    setProgress(35);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (reduced) draw(0, false);
    else raf = window.requestAnimationFrame(frame);

    const initialize = async () => {
      try {
        if ('fonts' in document) await document.fonts.ready;
      } catch {
        // The system fallback font remains available if remote fonts fail.
      }
      setProgress(72);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      setProgress(100);
    };
    void initialize();

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // The intro reports API verification, not a fictional "global node" status.
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
        setLatency(Math.max(1, Math.round(performance.now() - started)));
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

  const playDigitalChime = async () => {
    if (!soundEnabled || typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      const audio = new AudioContext();
      audioContextRef.current = audio;
      await audio.resume();
      const now = audio.currentTime;
      const master = audio.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.06);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
      master.connect(audio.destination);
      let endedOscillators = 0;
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.11 / (index + 1), now + 0.05 + index * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65 + index * 0.06);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.onended = () => {
          endedOscillators += 1;
          if (endedOscillators === 4 && audioContextRef.current === audio) {
            audioContextRef.current = null;
            void audio.close().catch(() => undefined);
          }
        };
        oscillator.start(now);
        oscillator.stop(now + 1.95);
      });
    } catch {
      const audio = audioContextRef.current;
      audioContextRef.current = null;
      if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined);
      // Audio is decorative; entry must work even when sound is unavailable.
    }
  };

  const nodeLabel = nodeState === 'online' ? t.ready : nodeState === 'checking' ? t.connecting : t.offline;

  return (
    <main
      className={`afg-boot-screen ${reducedMotion ? 'is-reduced' : ''}`}
      lang={isRtl ? ({ dari: 'fa-AF', persian: 'fa', pashto: 'ps', arabic: 'ar', urdu: 'ur' } as Partial<Record<Language, string>>)[language] || 'fa' : 'en'}
      dir={isRtl ? 'rtl' : 'ltr'}
      aria-label={isRtl ? 'خوش‌آمدگویی سینمایی AFG AI' : 'AFG AI cinematic welcome'}
    >
      <canvas ref={canvasRef} className="afg-boot-canvas" aria-hidden="true" />
      <div className="afg-boot-grain" aria-hidden="true" />
      <div className="afg-boot-vignette" aria-hidden="true" />
      <div className="afg-boot-grid afg-boot-grid-ceiling" aria-hidden="true" />
      <div className="afg-boot-grid afg-boot-grid-floor" aria-hidden="true" />
      <div className="afg-boot-beams" aria-hidden="true"><i /><i /><i /><i /><i /></div>

      <header className="afg-boot-header">
        <div className="afg-boot-wordmark"><span className="afg-boot-mark">A</span><span>AFG <b>AI</b></span><small>INTELLIGENCE SYSTEM</small></div>
        <div className="afg-boot-header-actions">
          <button
            type="button"
            className="afg-boot-sound"
            aria-label={soundEnabled ? t.soundOff : t.soundOn}
            aria-pressed={soundEnabled}
            onClick={() => setSoundEnabled((enabled) => !enabled)}
          >
            <span aria-hidden="true">{soundEnabled ? '♪' : '♫̸'}</span>
            <span>{soundEnabled ? t.soundEnabled : t.soundDisabled}</span>
          </button>
          <div className={`afg-boot-status state-${nodeState}`} aria-live="polite">
            <i />
            <span>{t.apiStatus}</span>
            <b>{nodeLabel}</b>
            <em>{latency === null ? '—' : `${latency} ms`}</em>
          </div>
        </div>
      </header>

      <section className="afg-boot-stage" aria-label={isRtl ? 'هسته هوشمند AFG AI' : 'AFG AI intelligence core'}>
        <div className="afg-boot-scene">
          <svg className="afg-boot-circuit" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
            <path className="circuit-line" d="M170 145 H320 L420 235 H500 M830 145 H680 L580 235 H500 M170 415 H320 L420 325 H500 M830 415 H680 L580 325 H500" />
            <circle cx="170" cy="145" r="5" /><circle cx="830" cy="145" r="5" /><circle cx="170" cy="415" r="5" /><circle cx="830" cy="415" r="5" />
          </svg>
          <article className="afg-boot-panel panel-neural"><small>01 / THINK</small><strong>{t.engine}</strong><span className="afg-boot-panel-value">60 <i>●</i></span><span className="afg-boot-panel-caption">{t.capacity}</span></article>
          <article className="afg-boot-panel panel-create"><small>02 / CREATE</small><strong>{t.create}</strong><span className="afg-boot-panel-value">GENERATIVE</span><span className="afg-boot-panel-caption">{isRtl ? 'ایده تا نتیجه' : 'Ideas into reality'}</span></article>
          <div className="afg-boot-central">
            <div className="afg-boot-central-halo" />
            <div className="afg-boot-central-ring ring-one" />
            <div className="afg-boot-central-ring ring-two" />
            <div className="afg-boot-central-core"><span>AFG</span><b>AI</b></div>
            <div className="afg-boot-core-label"><i /> AFG / CORE 01</div>
          </div>
          <article className="afg-boot-panel panel-explore"><small>03 / EXPLORE</small><strong>{t.explore}</strong><span className="afg-boot-panel-value">∞ <i>●</i></span><span className="afg-boot-panel-caption">{isRtl ? 'دانش بدون مرز' : 'Knowledge without limits'}</span></article>
          <article className="afg-boot-panel panel-live"><small>04 / LIVE</small><strong>{t.live}</strong><span className="afg-boot-panel-value">{nodeState === 'online' ? 'ONLINE' : nodeState === 'checking' ? 'SYNCING' : 'LOCAL'}</span><span className="afg-boot-panel-caption">{latency === null ? t.apiStatus : latency + ' ms · ' + t.latency}</span></article>
        </div>
        <div className="afg-boot-bottom">
          <section className="afg-boot-copy">
            <p className="afg-boot-eyebrow"><i />{t.eyebrow}<i /></p>
            <h1><span>{t.title}</span> <em>{t.accent}</em></h1>
            <p className="afg-boot-tagline">{t.line}</p>
          </section>
          <footer className="afg-boot-footer">
            <div className="afg-boot-progress-meta"><span>{t.loading}</span><b>{String(progress).padStart(2, '0')}%</b></div>
            <div className="afg-boot-progress"><i style={{ width: progress + '%' }} /></div>
            <div className="afg-boot-footer-row"><span>BUILT FOR WHAT'S NEXT</span><span>AFGHANISTAN · GLOBAL INTELLIGENCE</span></div>
            <button type="button" className="afg-boot-enter" onClick={() => { void playDigitalChime(); onComplete(); }} disabled={progress < 100}>
              <span>{t.enter}</span><b aria-hidden="true">↗</b>
            </button>
          </footer>
        </div>
      </section>
    </main>
  );
};
