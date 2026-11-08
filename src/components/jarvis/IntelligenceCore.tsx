import React, { useEffect, useRef, useState } from "react";
import type { CoreState, GraphicsProfile } from "./experience";

/** CSS 3D with an SVG nucleus: no WebGL context, GPU assets or animation loop. */
export default function IntelligenceCore({
  state,
  profile = "balanced",
  reduced = false,
  compact = false,
}: {
  state: CoreState;
  profile?: Exclude<GraphicsProfile, "auto">;
  reduced?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let intersecting = true;
    const visibility = () => setPaused(document.hidden || !intersecting);
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            intersecting = entry.isIntersecting;
            visibility();
          })
        : null;
    if (ref.current) observer?.observe(ref.current);
    if (!observer) setPaused(true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const particles = profile === "high" ? 16 : profile === "balanced" ? 8 : 0;
  return (
    <div
      ref={ref}
      className={`afg-core ${compact ? "is-compact" : ""}`}
      data-state={state}
      data-profile={profile}
      data-still={
        reduced || paused || state === "offline" || state === "cancelled"
      }
      aria-hidden="true"
    >
      <div className="afg-core-halo" />
      <div className="afg-core-reticle">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="afg-core-space">
        <div className="afg-core-orbit orbit-a">
          <i />
        </div>
        <div className="afg-core-orbit orbit-b">
          <i />
        </div>
        <div className="afg-core-orbit orbit-c">
          <i />
        </div>
        <div className="afg-core-nucleus">
          <svg viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="94" />
            <ellipse cx="100" cy="100" rx="44" ry="94" />
            <ellipse cx="100" cy="100" rx="76" ry="94" />
            <ellipse cx="100" cy="100" rx="94" ry="32" />
            <ellipse cx="100" cy="100" rx="94" ry="65" />
            <path d="M6 100h188M100 6v188" />
          </svg>
          <div className="afg-core-aperture">
            <span />
            <span />
            <span />
          </div>
        </div>
        {Array.from({ length: particles }, (_, i) => (
          <i
            key={i}
            className="afg-core-particle"
            style={
              {
                "--i": i,
                "--angle": `${i * 137.5}deg`,
                "--distance": `${103 + (i % 3) * 14}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="afg-core-floor" />
    </div>
  );
}
