import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import type { Language } from "../../types/afg";
import { experienceCopy } from "../jarvis/experienceCopy";
import { cinematicCopy } from "../cinematic/copy";
import { CinematicField } from "../cinematic/CinematicField";
import type { GraphicsProfile } from "../jarvis/experience";
import "./AfgCinematicIntro.css";
const IntelligenceCore = lazy(() => import("../jarvis/IntelligenceCore"));

/** Optional, user-paced welcome. It never stands in for service initialization. */
export const AfgCinematicIntro: React.FC<{
  language: Language;
  onComplete: () => void;
  embedded?: boolean;
  profile?: Exclude<GraphicsProfile, "auto">;
  reduced?: boolean;
}> = ({
  language,
  onComplete,
  embedded = false,
  profile = "balanced",
  reduced = false,
}) => {
  const t = experienceCopy(language);
  const cinematic = cinematicCopy(language);
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState(false);
  const [ready, setReady] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setReady(true);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), 850);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => undefined);
    },
    [],
  );
  const chime = async () => {
    if (sound) {
      await audio.current?.close().catch(() => undefined);
      audio.current = null;
      setSound(false);
      return;
    }
    setSoundError(false);
    if (!("AudioContext" in window)) {
      setSoundError(true);
      return;
    }
    try {
      const context = new AudioContext();
      audio.current = context;
      await context.resume();
      setSound(true);
      const now = context.currentTime;
      [523.25, 783.99].forEach((hz, i) => {
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.frequency.value = hz;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.035, now + 0.04 + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        tone.connect(gain);
        gain.connect(context.destination);
        tone.start();
        tone.stop(now + 0.65);
        if (i === 1)
          tone.onended = () => {
            void context.close().catch(() => undefined);
            if (audio.current === context) {
              audio.current = null;
              setSound(false);
            }
          };
      });
    } catch {
      setSound(false);
      setSoundError(true);
    }
  };
  return (
    <section
      className={`afg-welcome ${embedded ? "is-embedded" : ""}`}
      data-still={reduced}
      data-ready={ready}
    >
      <CinematicField variant="welcome" profile={profile} reduced={reduced} />
      <div className="afg-welcome-grid" aria-hidden="true" />
      <div className="afg-welcome-brand">
        <span className="afg-welcome-wordmark">
          AFG <b>AI</b>
        </span>
        <span className="afg-welcome-series">01 / 02</span>
      </div>
      <div className="afg-welcome-stage">
        <div className="afg-welcome-orbit-label" aria-hidden="true">
          <span />
          AFG AI / INTELLIGENCE
          <span />
        </div>
        <Suspense fallback={<div className="afg-core-placeholder" />}>
          <IntelligenceCore
            state="idle"
            profile={profile}
            reduced={reduced}
            variant="cinematic"
          />
        </Suspense>
      </div>
      <div className="afg-welcome-copy">
        <small>{cinematic.welcomeLine}</small>
        <h2>{t.intro}</h2>
        <p>{t.introBody}</p>
      </div>
      <div className="afg-welcome-boot" role="status" aria-live="polite">
        <span className="afg-welcome-boot-ring" aria-hidden="true" />
        {ready ? cinematic.welcomeReady : cinematic.welcomeBoot}
      </div>
      <div className="afg-welcome-actions">
        <button
          type="button"
          className="afg-primary"
          onClick={onComplete}
          disabled={!ready}
        >
          {t.continue}
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          aria-label={sound ? t.soundOff : t.soundOn}
          aria-pressed={sound}
          onClick={() => void chime()}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>
      <div className="afg-welcome-scan" aria-hidden="true" />
      {soundError && (
        <p role="status" className="afg-setting-error">
          {t.soundUnavailable}
        </p>
      )}
    </section>
  );
};
