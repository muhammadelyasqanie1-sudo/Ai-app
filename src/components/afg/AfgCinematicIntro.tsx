import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import type { Language } from "../../types/afg";
import { experienceCopy } from "../jarvis/experienceCopy";
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
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState(false);
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
    >
      <div className="afg-welcome-grid" aria-hidden="true" />
      <div className="afg-welcome-brand">
        AFG <b>AI</b>
        <span>01 / 02</span>
      </div>
      <Suspense fallback={<div className="afg-core-placeholder" />}>
        <IntelligenceCore state="idle" profile={profile} reduced={reduced} />
      </Suspense>
      <div className="afg-welcome-copy">
        <small>AFG AI</small>
        <h2>{t.intro}</h2>
        <p>{t.introBody}</p>
      </div>
      <div className="afg-welcome-actions">
        <button type="button" className="afg-primary" onClick={onComplete}>
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
      {soundError && (
        <p role="status" className="afg-setting-error">
          {t.soundUnavailable}
        </p>
      )}
    </section>
  );
};
