import { useEffect, useState } from "react";

export type GraphicsProfile = "auto" | "high" | "balanced" | "low";
export type CoreState =
  | "idle"
  | "listening"
  | "thinking"
  | "generating"
  | "searching"
  | "executing"
  | "error"
  | "offline"
  | "cancelled";
export type ToolActivity = {
  name: string;
  label: string;
  status: "running" | "completed" | "failed";
};
export const EXPERIENCE_KEY = "afg_visual_preferences_v1";
export type ExperiencePreferences = {
  graphics: GraphicsProfile;
  motion: "system" | "reduced";
  panel: boolean;
  sound: boolean;
  volume: number;
};
const defaults: ExperiencePreferences = {
  graphics: "auto",
  motion: "system",
  panel: true,
  sound: true,
  volume: 0.3,
};
export function readExperience(): ExperiencePreferences {
  try {
    const data = JSON.parse(localStorage.getItem(EXPERIENCE_KEY) || "null");
    return {
      graphics: ["auto", "high", "balanced", "low"].includes(data?.graphics)
        ? data.graphics
        : "auto",
      motion: data?.motion === "reduced" ? "reduced" : "system",
      panel: typeof data?.panel === "boolean" ? data.panel : true,
      sound: typeof data?.sound === "boolean" ? data.sound : true,
      volume: typeof data?.volume === "number" && Number.isFinite(data.volume)
        ? Math.max(0, Math.min(1, data.volume))
        : 0.3,
    };
  } catch {
    return defaults;
  }
}
export function resolveGraphics(
  profile: GraphicsProfile,
  hardware: {
    memory?: number;
    cores?: number;
    saveData?: boolean;
    mobile?: boolean;
  },
): Exclude<GraphicsProfile, "auto"> {
  if (profile !== "auto") return profile;
  if (
    hardware.saveData ||
    (hardware.memory !== undefined && hardware.memory <= 4) ||
    (hardware.cores !== undefined && hardware.cores <= 4)
  )
    return "low";
  // Unknown devices and phones get a conservative default. High is an explicit choice.
  return "balanced";
}
export function resolveCoreState(input: {
  listening: boolean;
  active: boolean;
  streaming: boolean;
  online: boolean;
  failed: boolean;
  cancelled?: boolean;
  activities: ToolActivity[];
}): CoreState {
  if (input.listening) return "listening";
  if (input.active) {
    const tool = input.activities.find((item) => item.status === "running");
    if (tool)
      return /search|research|browse|web|fetch/i.test(tool.name)
        ? "searching"
        : "executing";
    return input.streaming ? "generating" : "thinking";
  }
  if (input.cancelled) return "cancelled";
  if (input.failed) return "error";
  return input.online ? "idle" : "offline";
}
export function useExperience() {
  const [preferences, setPreferences] = useState(readExperience);
  const [storageError, setStorageError] = useState(false);
  const [systemReduced, setSystemReduced] = useState(
    () =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("afg-reduce-motion"),
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setSystemReduced(
        media.matches ||
          document.documentElement.classList.contains("afg-reduce-motion"),
      );
    media.addEventListener("change", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);
  const update = (patch: Partial<ExperiencePreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    window.dispatchEvent(
      new CustomEvent("afg-visual-preferences", { detail: next }),
    );
  };
  const hardware = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    preferences,
    update,
    storageError,
    profile: resolveGraphics(preferences.graphics, {
      memory: hardware.deviceMemory,
      cores: hardware.hardwareConcurrency,
      saveData: hardware.connection?.saveData,
    }),
    reduced: systemReduced || preferences.motion === "reduced",
  };
}
