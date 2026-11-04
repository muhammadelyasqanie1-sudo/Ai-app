# AFG AI cinematic welcome scene

## Purpose

The first-launch visual is an in-app cinematic identity scene, not a provider feature and not a video player. It introduces the AFG AI brand and then hands control to the existing authentication/guest entry flow.

## Visual composition

- Full-viewport, responsive 16:9-inspired composition adapted to phone portrait and desktop landscape.
- Dark navy/black environment with the AFG AI cyan/violet palette and a warm amber ignition point.
- A bounded canvas network of 60 nodes and 80 particles, proximity-based connections, a pulsing central glow and fine light rays.
- Existing HTML/CSS 3D core, orbit rings, circuit lines and four feature panels remain the primary brand composition.
- Main Dari message: «آغاز یک تحول...». English message: “A New Era Begins...”.
- The central wordmark and the app's existing tagline remain visible.

## Runtime and accessibility

- Canvas uses a device-pixel-ratio cap of 1.5 and a bounded particle count for mid-range mobile devices.
- Animation pauses while the document is hidden and resumes when visible.
- `prefers-reduced-motion` renders a static scene; no animation loop is started.
- The welcome chime is synthesized locally with Web Audio only after the user presses the entry button. It can be muted from the visible sound control. No audio asset, remote audio request or autoplay-with-sound is used.
- If Web Audio is unavailable or blocked, entry continues normally.
- The entry button remains disabled only while local font/layout preparation is incomplete.
- The API status chip calls `GET /api/capabilities` with a bounded 4.5-second timeout. It reports only verified/unverified API status and measured response time; it does not claim that the entire global platform is online.

## Scope and limitations

- This is an animated welcome scene, not a welcome-video player. No video file, poster, subtitles or third-party player is added.
- The current intro copy is authored in Dari and English. Other RTL locales use the Dari fallback copy until reviewed translations are supplied; the document language and direction are still set for the selected RTL locale.
- The API check is informational and does not block entry. It does not make provider calls or claim model availability beyond the backend capability response.
- No database persistence or migration is required for this decorative, client-only experience.

## Verification

Source changes are not runtime verification. Follow repository policy: do not run tests, type checks, builds, or deployments without explicit project-owner approval. Verify on a narrow Android viewport, desktop landscape, reduced-motion mode, audio-muted mode, and API timeout/offline state when an authorized verification pass is scheduled.
