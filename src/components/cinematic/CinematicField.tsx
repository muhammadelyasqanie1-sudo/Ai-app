import React, { useEffect, useRef } from "react";
import type { GraphicsProfile } from "../jarvis/experience";
import "./cinematic.css";

type FieldProfile = Exclude<GraphicsProfile, "auto">;
type Variant = "welcome" | "core" | "ambient";

type Particle = {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  speed: number;
  drift: number;
  phase: number;
};

/**
 * A bounded, device-aware canvas field shared by the cinematic surfaces.
 * It is decorative only: it never represents AI activity or progress.
 */
export function CinematicField({
  profile,
  reduced,
  variant = "ambient",
  className = "",
}: {
  profile: FieldProfile;
  reduced: boolean;
  variant?: Variant;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced || profile === "low") return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const density =
      variant === "core"
        ? profile === "high"
          ? 54
          : 28
        : variant === "welcome"
          ? profile === "high"
            ? 42
            : 24
          : profile === "high"
            ? 26
            : 14;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 1;
    let height = 1;
    let frame = 0;
    let visible = true;
    let running = true;
    let previous = performance.now();
    let particles: Particle[] = [];

    const seed = () => {
      const random = (min: number, max: number) =>
        min + Math.random() * (max - min);
      particles = Array.from({ length: density }, () => ({
        x: random(0, width),
        y: random(0, height),
        z: random(0.25, 1),
        size: random(0.45, 1.65),
        alpha: random(0.18, 0.72),
        speed: random(2.5, 11),
        drift: random(-4, 4),
        phase: random(0, Math.PI * 2),
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed();
    };

    const draw = (now: number) => {
      if (!running || !visible) return;
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        particle.x += particle.speed * delta * particle.z;
        particle.y += particle.drift * delta * particle.z;
        if (particle.x > width + 12) particle.x = -12;
        if (particle.x < -12) particle.x = width + 12;
        if (particle.y > height + 12) particle.y = -12;
        if (particle.y < -12) particle.y = height + 12;
        const shimmer =
          particle.alpha *
          (0.62 + 0.38 * Math.sin(now / 1200 + particle.phase));
        context.beginPath();
        context.fillStyle = `rgba(${variant === "core" ? "158, 225, 255" : "109, 220, 255"}, ${shimmer})`;
        context.arc(particle.x, particle.y, particle.size * particle.z, 0, Math.PI * 2);
        context.fill();
      }

      const streaks = variant === "welcome" ? 4 : variant === "core" ? 3 : 2;
      for (let index = 0; index < streaks; index += 1) {
        const y = ((now / (variant === "core" ? 30 : 42) + index * 137) % (height + 160)) - 80;
        const gradient = context.createLinearGradient(0, y, width * 0.72, y - 38);
        gradient.addColorStop(0, "rgba(13, 242, 255, 0)");
        gradient.addColorStop(0.5, `rgba(13, 242, 255, ${0.08 + index * 0.018})`);
        gradient.addColorStop(1, "rgba(176, 154, 255, 0)");
        context.strokeStyle = gradient;
        context.lineWidth = 0.8;
        context.beginPath();
        context.moveTo(-20, y);
        context.lineTo(width * 0.72, y - 38);
        context.stroke();
      }

      context.globalCompositeOperation = "source-over";
      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (!running || frame) return;
      previous = performance.now();
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const visibility = () => {
      if (document.hidden || !visible) stop();
      else start();
    };

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            visibility();
          })
        : null;
    observer?.observe(canvas);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    resize();
    if (!observer) start();

    return () => {
      running = false;
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
      context.clearRect(0, 0, width, height);
    };
  }, [profile, reduced, variant]);

  return (
    <div
      className={`afg-cinematic-field is-${variant} ${className}`}
      data-still={reduced}
      aria-hidden="true"
    >
      <div className="afg-cinematic-nebula" />
      <canvas ref={canvasRef} />
      <div className="afg-cinematic-grid" />
      <div className="afg-cinematic-vignette" />
    </div>
  );
}
