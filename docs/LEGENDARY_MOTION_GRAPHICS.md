# AFG AI — Legendary Motion Graphics

## Repository-grounded implementation

This work extends the existing React 19 + Vite + Tailwind 4 + Capacitor 8 application. It reuses the installed motion package and the existing CSS/SVG IntelligenceCore; it does not add a second competing core or a WebGL dependency.

## Visual system

- Deep surfaces: #05060A, #0B0F17
- Energy: cyan #0DF2FF, blue #168BFF, violet #7C4DFF, amber #FFB86B
- Error: #FF5C7A
- Existing Plus Jakarta Sans and Vazirmatn typography remain authoritative.
- Existing semantic theme tokens and user theme preferences remain authoritative.

## State language

The current runtime states map to cinematic states without fabricated activity:
- idle → cyan/blue breathing core
- listening → cyan/amber sonar pulse
- thinking → violet counter-orbit and inward energy
- searching → blue research scan
- executing → cyan/violet stepped coding orbit
- generating → violet/amber bloom
- error → rose hard pulse
- offline/cancelled → static muted state

File processing and speaking are available in the visual resolver, but must only be selected when the real upload/TTS lifecycle exposes reliable signals. No fake progress is displayed.

## Introduction sequence

The existing optional welcome screen remains user-paced and skippable through its existing Continue action. CSS choreography reveals the grid, core, brand, copy, and actions over approximately 3.4 seconds. Existing audio opt-in and reduced-motion behavior are preserved.

## Performance

- Existing device profiles remain authoritative: high 16 particles, balanced 8, low 0.
- Canvas is a single overlay, pauses while hidden or outside the viewport, and caps DPR at 2 on high and 1.5 on balanced.
- No external image textures or video assets are required.
- Low profile and reduced-motion settings disable the canvas and animated effects.
- Existing experience.ts auto profile logic remains the source of device adaptation.
- This uses CSS 3D/SVG and Canvas 2D, not volumetric ray-traced 3D. A future WebGL tier should be opt-in and lazy-loaded only after device benchmarks.

## Integration notes

The existing IntelligenceCore remains the sole core rendered by AfgCinematicIntro and JarvisShell. Runtime activity continues to be resolved by the existing experience.ts logic from real tool/chat state. The new resolver is a visual contract only.

## Verification status

Source changes only. No tests, type-check, build, Android device run, workflow, or deployment has been initiated.
