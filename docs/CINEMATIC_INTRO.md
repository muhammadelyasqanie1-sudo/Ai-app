# AFG AI cinematic welcome scene

## Purpose

The first-launch visual is a full-screen in-app introduction, not a provider feature and not a video player. It introduces the AFG AI identity, reports only local boot readiness, and hands control to the existing personalization and workspace flow. Dismissal uses the existing `afg_intro_seen` key; Appearance settings can replay the scene.

## Visual composition

- Full-viewport stage inside the existing native dialog (`.afg-experience-dialog.is-intro`) rather than a second modal system.
- Shared `CinematicField` canvas: bounded particles, slow light streaks, nebula gradients, a perspective grid and a vignette. The field is decorative and never indicates AI activity.
- The existing `IntelligenceCore` component in its cinematic variant: CSS/SVG nucleus, orbital rings, halo and live-state label.
- AFG AI wordmark, section index, orbital label, scanline, tagline and staged entrance.
- Copy: “One AI. Many capabilities. One intelligent platform.” with the existing localized welcome title and body.
- The boot status changes from “Calibrating intelligence surface” to “Workspace ready” only after the local layout/font preparation timer completes. It is not a fake backend or model check.
- A short locally synthesized chime is optional and starts muted. No audio asset or autoplay is used.

## Runtime and accessibility

- Particles scale by graphics profile: high 42, balanced 24, low none. Device pixel ratio is capped at 1.5.
- The canvas pauses while the document is hidden or the field leaves the viewport.
- `prefers-reduced-motion` renders a static scene, hides the canvas and stops CSS animations.
- The animation is responsive; at mobile widths the copy, core and action row remain reachable without horizontal overflow.
- Entry is disabled only while local boot preparation is incomplete. Skipping remains available.
- Sound failures are reported through the existing status message; the scene remains usable.

## Localization

The shared `cinematicCopy` table supplies welcome, core, dashboard, chat, media and settings labels in English, Dari/Persian, Pashto and Arabic. The dialog inherits the document language and `dir` value from the app. New labels avoid mixed-language fallbacks; legacy screens retain their existing localization gaps.

## Scope and limitations

- This is an animated introduction, not a welcome-video player or a three.js scene. No WebGL, external image, video or model download is added.
- No database persistence or migration is required for these decorative, client-only surfaces.
- Live provider, tool and model activity continues to come from the existing workspace events. The core does not invent reasoning stages or provider status.
- The welcome does not block access to the workspace, and it does not authenticate the user.

## Verification

TypeScript, the production build, i18n validation and the JARVIS command regression script pass. Cloud Chromium checked the desktop welcome, dashboard, AI Core and settings screens at 1200px and a 390px mobile viewport, including Arabic RTL and the six-item mobile navigation at 390px with no horizontal overflow. Reduced-motion and performance behavior are implemented in the shared field and core; physical Android 10 testing remains outstanding.
