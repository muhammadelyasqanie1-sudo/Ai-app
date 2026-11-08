import React, { useEffect, useRef, useState } from "react";
import type { CoreState, GraphicsProfile } from "./experience";
import { resolveVisual, toLegendaryState, mediaJobVisualState, type LegendaryCoreState } from "../../animations/coreState";
import { apiFetch } from "../../lib/apiClient";
import "./legendary-core.css";

/** CSS 3D/SVG core with a lightweight Canvas energy field; no WebGL context or binary assets. */
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [mediaState, setMediaState] = useState<LegendaryCoreState | null>(null);

  // Reflect actual, owner-scoped server jobs in the core; never infer progress from a button click.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof window.setTimeout> | undefined;
    const refreshMediaState = async () => {
      try {
        const response = await apiFetch("/api/media/jobs", { cache: "no-store" });
        if (!response.ok) throw new Error("media_jobs_unavailable");
        const payload = await response.json();
        const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        const active = jobs.find((job: any) => {
          const taskStatus = String(job.status || "");
          const executionState = String(job.execution_state || "");
          return ["ready", "running", "pending", "executing"].includes(taskStatus) ||
            ["pending", "executing"].includes(executionState);
        });
        const next = mediaJobVisualState(active?.request?.type);
        if (alive) setMediaState(next);
      } catch {
        if (alive) setMediaState(null);
      } finally {
        if (alive) timer = window.setTimeout(refreshMediaState, 5000);
      }
    };
    void refreshMediaState();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const primaryState = state === "listening" || state === "speaking" ||
    state === "offline" || state === "cancelled" || state === "error";
  const visualState = primaryState ? toLegendaryState(state) : (mediaState ?? toLegendaryState(state));
  const visual = resolveVisual(visualState, profile, reduced || paused || state === "offline" || state === "cancelled");

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = ref.current;
    if (!canvas || !host || visual.particleCount === 0 || paused || reduced) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, profile === "high" ? 2 : 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const style = getComputedStyle(host);
    const colorA = style.getPropertyValue("--energy").trim() || "#0DF2FF";
    const colorB = style.getPropertyValue("--energy-secondary").trim() || "#168BFF";
    const cx = width / 2;
    const cy = height / 2;
    const particles = Array.from({ length: visual.particleCount }, (_, index) => ({
      angle: (index / visual.particleCount) * Math.PI * 2 + Math.random() * 0.4,
      radius: Math.min(width, height) * (0.31 + Math.random() * 0.16),
      speed: 0.00018 + Math.random() * 0.00028,
      size: 0.8 + Math.random() * 1.4,
      color: index % 2 ? colorA : colorB,
      phase: Math.random() * Math.PI * 2,
    }));
    let frame = 0;
    let last = performance.now();
    let hidden = document.hidden;
    const draw = (now: number) => {
      if (hidden) return;
      const delta = Math.min(now - last, 48);
      last = now;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const particle of particles) {
        particle.angle += particle.speed * delta * (0.65 + visual.ringSpeed * 0.35);
        const target = Math.min(width, height) * (
          visual.particleDrift < 0 ? 0.2 : visual.particleDrift > 0 ? 0.48 : 0.36
        );
        particle.radius += (target - particle.radius) * 0.0008 * delta;
        const x = cx + Math.cos(particle.angle) * particle.radius;
        const y = cy + Math.sin(particle.angle) * particle.radius * 0.82;
        const alpha = 0.38 + (Math.sin(now * 0.001 + particle.phase) + 1) * 0.2;
        context.globalAlpha = alpha;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      hidden = document.hidden;
      if (hidden) cancelAnimationFrame(frame);
      else {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      context.clearRect(0, 0, width, height);
    };
  }, [visual.particleCount, visual.particleDrift, visual.ringSpeed, profile, paused, reduced, visualState]);

  const particles = profile === "high" ? 16 : profile === "balanced" ? 8 : 0;
  return (
    <div
      ref={ref}
      className={`afg-core ${compact ? "is-compact" : ""}`}
      data-state={state}
      data-visual-state={visualState}
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
        <div className="afg-core-orbit orbit-a"><i /></div>
        <div className="afg-core-orbit orbit-b"><i /></div>
        <div className="afg-core-orbit orbit-c"><i /></div>
        <div className="afg-core-nucleus">
          <svg viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="94" />
            <ellipse cx="100" cy="100" rx="44" ry="94" />
            <ellipse cx="100" cy="100" rx="76" ry="94" />
            <ellipse cx="100" cy="100" rx="94" ry="32" />
            <ellipse cx="100" cy="100" rx="94" ry="65" />
            <path d="M6 100h188M100 6v188" />
          </svg>
          <div className="afg-core-aperture"><span /><span /><span /></div>
        </div>
        {Array.from({ length: particles }, (_, i) => (
          <i
            key={i}
            className="afg-core-particle"
            style={{
              "--i": i,
              "--angle": `${i * 137.5}deg`,
              "--distance": `${103 + (i % 3) * 14}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <canvas ref={canvasRef} className="afg-core-energy-canvas" />
      <div className="afg-core-floor" />
    </div>
  );
}
