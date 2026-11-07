import React, { useEffect, useRef, useState } from "react";
import type { Language } from "../../types/afg";
import { experienceCopy } from "./experienceCopy";
import { readExperience } from "./experience";

/** Displays real samples from an already authorized stream; never opens a microphone. */
export function AudioWaveform({
  stream,
  language,
}: {
  stream: MediaStream | null;
  language: Language;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [meterAvailable, setMeterAvailable] = useState(false);
  const t = experienceCopy(language);
  useEffect(() => {
    if (!stream || !("AudioContext" in window)) return;
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;
    try {
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
    } catch {
      void context.close().catch(() => undefined);
      return;
    }
    analyser.fftSize = 256;
    source.connect(analyser); // No speaker destination: microphone audio is never played back.
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0,
      previous = 0,
      disposed = false;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let motionPreference = readExperience().motion;
    let reduced =
      media.matches ||
      motionPreference === "reduced" ||
      document.documentElement.classList.contains("afg-reduce-motion");
    const sync = (event?: Event) => {
      if (event?.type === "afg-visual-preferences")
        motionPreference = (event as CustomEvent).detail.motion;
      reduced =
        media.matches ||
        motionPreference === "reduced" ||
        document.documentElement.classList.contains("afg-reduce-motion");
      cancelAnimationFrame(frame);
      if (
        !disposed &&
        !reduced &&
        !document.hidden &&
        context.state === "running"
      )
        frame = requestAnimationFrame(draw);
    };
    const draw = (time: number) => {
      if (disposed) return;
      if (reduced || document.hidden) return;
      if (!document.hidden && !reduced && time - previous >= 33) {
        const target = canvas.current;
        const brush = target?.getContext("2d");
        if (target && brush) {
          analyser.getByteTimeDomainData(samples);
          brush.clearRect(0, 0, target.width, target.height);
          brush.fillStyle = getComputedStyle(target).color;
          for (let i = 0; i < 24; i++) {
            const amplitude = Math.abs(samples[i * 10] - 128) / 128;
            const height = Math.max(1, amplitude * 30);
            brush.fillRect(i * 5, (32 - height) / 2, 2, height);
          }
        }
        previous = time;
      }
      frame = requestAnimationFrame(draw);
    };
    void context
      .resume()
      .then(() => {
        if (!disposed) {
          setMeterAvailable(true);
          sync();
        }
      })
      .catch(() => setMeterAvailable(false));
    const observer = new MutationObserver(() => sync());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("afg-visual-preferences", sync);
    return () => {
      disposed = true;
      observer.disconnect();
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("afg-visual-preferences", sync);
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => undefined);
    };
  }, [stream]);
  return (
    <div className="afg-audio-meter" role="status">
      <span className="afg-state-dot" />
      {t.listening}
      {meterAvailable && (
        <canvas ref={canvas} width={120} height={32} aria-hidden="true" />
      )}
    </div>
  );
}
