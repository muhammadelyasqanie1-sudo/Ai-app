/** Shared motion timings for the AFG AI cinematic experience. Values are seconds. */
export const AFG_EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const AFG_EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
export const AFG_MOTION = { fast: 0.14, normal: 0.24, slow: 0.6, intro: 3.4 } as const;

export const AFG_MOTION_VARIANTS = {
  messageIn: {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0 },
  },
  panelIn: {
    initial: { opacity: 0, x: "var(--afg-panel-x, 24px)" },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: "var(--afg-panel-x, 24px)" },
  },
} as const;
