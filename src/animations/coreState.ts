import type { CoreState as RuntimeCoreState, GraphicsProfile } from "../components/jarvis/experience";

export type LegendaryCoreState =
  | "idle" | "listening" | "thinking" | "researching" | "coding"
  | "generatingImage" | "processingFile" | "speaking" | "error"
  | "offline" | "cancelled";

export interface CoreVisual {
  ringSpeed: number;
  ringCount: number;
  particleCount: number;
  particleDrift: -1 | 0 | 1;
  hue: readonly [string, string];
  pulseSeconds: number;
}

const PARTICLES: Record<Exclude<GraphicsProfile, "auto">, number> = {
  high: 16, balanced: 8, low: 0,
};

const STATE_MAP: Record<RuntimeCoreState, LegendaryCoreState> = {
  idle: "idle", listening: "listening", thinking: "thinking",
  generating: "generatingImage", searching: "researching",
  executing: "coding", error: "error", offline: "offline",
  cancelled: "cancelled",
};

export function toLegendaryState(state: RuntimeCoreState): LegendaryCoreState {
  return STATE_MAP[state];
}

export function resolveVisual(
  state: LegendaryCoreState,
  profile: Exclude<GraphicsProfile, "auto">,
  reducedMotion: boolean,
): CoreVisual {
  const base: CoreVisual = {
    ringSpeed: 1, ringCount: profile === "low" ? 1 : 3,
    particleCount: PARTICLES[profile], particleDrift: 0,
    hue: ["--afg-core-cyan", "--afg-core-blue"], pulseSeconds: 4.2,
  };
  const variants: Partial<Record<LegendaryCoreState, Partial<CoreVisual>>> = {
    listening: { hue: ["--afg-core-cyan", "--afg-core-amber"], particleDrift: 1, pulseSeconds: 1.2 },
    thinking: { hue: ["--afg-core-violet", "--afg-core-blue"], ringSpeed: 2, particleDrift: -1, pulseSeconds: 2.1 },
    researching: { hue: ["--afg-core-blue", "--afg-core-cyan"], ringSpeed: 1.4, particleDrift: 1, pulseSeconds: 2.8 },
    coding: { hue: ["--afg-core-cyan", "--afg-core-violet"], ringSpeed: 0, pulseSeconds: 0.5 },
    generatingImage: { hue: ["--afg-core-violet", "--afg-core-amber"], ringSpeed: 0.5, pulseSeconds: 2.5 },
    processingFile: { hue: ["--afg-core-blue", "--afg-core-cyan"], ringSpeed: 0.8 },
    speaking: { hue: ["--afg-core-cyan", "--afg-core-blue"], ringSpeed: 1.2, pulseSeconds: 0.8 },
    error: { hue: ["--afg-core-error", "--afg-core-error"], ringSpeed: 0, particleCount: 0, pulseSeconds: 0.6 },
    offline: { hue: ["--afg-core-muted", "--afg-core-muted"], ringSpeed: 0, particleCount: 0, pulseSeconds: 0 },
    cancelled: { ringSpeed: 0, particleCount: 0, pulseSeconds: 0 },
  };
  const visual = { ...base, ...variants[state] };
  return reducedMotion
    ? { ...visual, ringSpeed: 0, particleCount: 0, particleDrift: 0, pulseSeconds: 0 }
    : visual;
}
