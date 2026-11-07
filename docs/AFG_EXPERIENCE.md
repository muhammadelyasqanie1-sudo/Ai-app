<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:979d0d67dce2adb2961c03ee3f7536dd5fa562dba3538f01b54cafd3a842d116 -->

# AFG AI experience — design and implementation

## Scope and compatibility

This milestone extends the existing command center. It retains the Express APIs, PostgreSQL schema, provider discovery, authenticated chat, SSE reader, cancellation, memory, tools and Capacitor plugins. No runtime dependency, migration, provider protocol or environment variable was added. No production deployment was performed.

The workspace now offers a skippable first-launch introduction; dismissal uses the existing `afg_intro_seen` key. Appearance settings can replay it. Signing in remains an explicit action through the existing authentication gate. The desktop sidebar and mobile bottom navigation follow the current command-center implementation and the requested design, superseding the older drawer-only design guide.

## Design architecture

| Source | Responsibility |
| --- | --- |
| `src/components/jarvis/intelligence.css` | Dark/light materials, typography, shared motion tokens, responsive command center, dialog and chat layout |
| `IntelligenceCore.tsx` | Lazy-loaded CSS 3D orbits and SVG nucleus; no WebGL context or downloaded asset |
| `experience.ts` | Validated local preferences, conservative graphics selection and activity-state resolver |
| `ExperiencePanel.tsx` | Native modal dialog, focus management, language/theme/graphics/motion controls and real setup links |
| `experienceCopy.ts`, `workspaceCopy.ts` | Centralized experience, dashboard, voice and local-file copy for English, Dari/Persian, Pashto and Arabic |
| `AudioWaveform.tsx` | Actual analyser samples from an already authorized recording stream; never requests microphone permission |
| `AfgCinematicIntro.tsx` / `.css` | Existing welcome component refactored into a user-paced introduction; optional sound starts muted |
| `JarvisShell.tsx`, `App.tsx` | Existing layout and real chat/tool/recording events connected to the new presentation |
| `AfgChatView.tsx`, `AfgChatInputCapsule.tsx`, `AfgHistoryView.tsx`, `types/afg.ts` | Accessible heading/status, responsive composer, draft preservation and cancellation metadata |
| `public/afg-ai-icon.svg`, `public/afg-ai-mark-light.svg` | Orbital brand mark, favicon/PWA icon and light variant |

### Activity truth

The visual core does not plan or execute tasks. Its state comes from application events:

| State | Evidence |
| --- | --- |
| Idle | No generation or recording is active; browser network signal is online |
| Listening | Browser speech recognition emitted `onstart`, or the existing MediaRecorder is recording |
| Thinking | A real chat request is pending without received content or a running tool |
| Generating | An active request has received message content |
| Searching | A backend-reported running search/research/browser tool |
| Executing | Another backend-reported running tool |
| Error | The latest message reports a failed request |
| Cancelled | The request was aborted, or stored message status is `cancelled`; core becomes static |
| Offline | No active request/recording/error/cancellation and browser network signal is offline |

Historical tool events cannot keep a cancelled or completed core busy. Existing `isError` remains available for retry behavior; additive `isCancelled` distinguishes cancellation in the visual layer and when loading stored history. No fabricated reasoning stages, model inventory, CPU metrics or waveform are displayed. A browser network signal does not prove Internet reachability; backend and database health remain separate checks.

### Graphics and motion

- **Automatic:** low when data saving, memory at most 4 GB, or at most four reported CPU cores; balanced when hints are absent or more capable. High requires a manual choice.
- **High:** three CSS 3D orbital rings, 16 particles and restrained glow.
- **Balanced:** three rings and eight particles.
- **Low:** static SVG nucleus; no orbital animation or particles.
- No WebGL, Three.js, texture downloads or model downloads are required. CSS 3D support failure falls back to the static view. The visual is decorative; textual status is always available.
- The core pauses outside the viewport and while the document is hidden. System, account and device reduced-motion preferences stop its animations. The live audio meter stops drawing while hidden or motion is reduced.
- Shared motion uses 140/240/600 ms tokens and `cubic-bezier(.22,.8,.24,1)`. Navigation, dialogs, hover feedback and message entry remain interruptible. Typography uses rem units based on the existing 14px default, so account text-size settings and browser zoom scale the command center.
- Preferences use `afg_visual_preferences_v1` in localStorage: graphics, motion and intelligence-panel visibility. These contain no credentials. Invalid input defaults safely; denied writes display an explanation and retain in-memory changes.

## Interaction and privacy

The welcome flow can be skipped immediately. Native `dialog.showModal()` provides focus containment, Escape cancellation and inert background content; focus returns to the opener. The command shortcut remains Ctrl/Command+K. The intelligence-panel preference survives refresh.

Mobile chat fits between the header and bottom navigation; messages scroll while the composer remains visible. Draft text remains editable while generation is pending. Enter cannot dispatch a second request or erase the draft during that request. Stop uses the existing AbortController.

Browser speech recognition offers real start/stop/error events and may use the browser vendor’s speech service. It provides no raw waveform API; that view shows a recording-state pulse. The chat recorder’s waveform uses actual time-domain samples from the existing, explicitly enabled microphone stream. No extra microphone stream is opened. Audio resources are disconnected and closed on teardown. Leaving the recorder or disabling voice discards pending capture without starting transcription. A manually stopped recording retains the existing transcription flow. The optional welcome chime plays only after pressing its sound control; there is no autoplay music.

Local file preview stays on the device. The visual update does not upload file content or change provider permissions.

## Start and configure

Use the existing repository setup (`README.md`, `.env.example`, `docs/PHASE1_RELIABILITY.md`). In a prepared checkout:

```sh
npm run dev
```

Open the registered Preview on port 3000. Use the sparkle control in the header for experience settings. Provider, account, voice and offline-model links open their existing destinations; no credentials or models are silently configured.

No new environment variables or migrations are required for this design milestone. Real inference still needs the existing configured provider service/model; accounts need PostgreSQL and the existing migrations. Provider keys remain server-side. This milestone does not alter Render/Railway startup configuration.

## Verification and limits

TypeScript, the existing production/i18n build, activity/graphics/storage regression tests, task-store tests and SSE parser tests were run. Cloud Chromium verified desktop, 390px mobile, tablet, light/dark/system themes, RTL, reduced motion, graphics profiles, dialog keyboard focus, local preference persistence, denied storage, genuine missing-provider failure and frontend cancellation. The audio meter was checked with a synthetic oscillator feeding a real MediaStream; no microphone was requested in that check.

See the task's generated verification report for exact measurements and screenshots. Automated accessibility checks found and prompted repairs to light navigation/status contrast and chat landmark/heading semantics. Final tested screens have no detected violations; gradient contrast retains an incomplete automated result, so this is not a complete accessibility audit.

### Remaining work

- Live provider streaming/tool activity, real microphone permissions/transcription and authenticated history on this design revision require external configuration and further verification.
- Native Android launcher/splash generation, physical-device performance, haptics and gesture-driven sheets were not implemented or tested. This checkout contains Capacitor plugins but no generated Android application project.
- New experience, dashboard, task, voice and local-file copy is centralized; gated workspace explanations and legacy tools/chat/settings still have localization gaps. Translations have not received a native-speaker review.
- Drag resizing, spatial knowledge graphs, native desktop/iOS packages and new autonomous workflows are not implemented by this design milestone.
- Existing large offline-engine/application chunks and CSS optimizer warnings remain. Low graphics reduces this scene's effects; it does not reduce inference-model memory requirements.
- Local visual preferences remain device-specific. Existing offline AI and synchronization capabilities retain their configuration and platform limits.

## Feature acceptance record

Owner: AFG AI command-center presentation. Status: **Incomplete as a whole**; the implemented presentation controls are verified locally, while live provider/voice and native journeys require further evidence.

| Acceptance criterion | Evidence and status for this milestone |
| --- | --- |
| 1. Localized, responsive UI | New experience controls and dashboard resources cover all five languages; desktop, mobile and RTL inspected. Incomplete across legacy chat/tools/settings and gated workspace explanations. |
| 2. Capability-aware UI | Existing model/capability inventory and provider setup links retained. No model or operational stage is fabricated. Missing-provider error and cancellation exercised; live provider states not externally verified. |
| 3. Validated, authorized backend | No new backend route or permission introduced. Existing authentication and ownership contracts retained; prior PostgreSQL isolation evidence reused for unchanged backend. |
| 4. Provider gateway | No provider call added; existing chat gateway unchanged. Waveform reads an already authorized local stream. |
| 5. Persistence | Device-only appearance and intro preferences persist on refresh. They contain no account data and intentionally do not synchronize across devices. Existing account message persistence is unchanged. |
| 6. Structured errors and IDs | Existing chat error/request-ID contract retained. Local preference failures are visible; a local preference write has no HTTP request or correlation ID. |
| 7. Observability | No new server operation to log. Local graphics preferences are deliberately not uploaded as telemetry. Backend activity continues to use existing events. |
| 8. Admin controls | Not applicable to personal graphics/theme/motion preferences; they grant no provider or tool permission. Existing server capability policy remains authoritative. |
| 9. Documentation | This guide, DESIGN_SYSTEM.md, the regression script and task verification report describe implementation, configuration and limits. |
| 10. Production hygiene | No runtime dependency or credential added. Missing service states remain explicit. Production build and selected regression checks passed; deployment and external workflows remain unverified. |

Next acceptance work: complete criterion 1 across the remaining legacy screens, then verify real provider streaming and microphone journeys under criteria 2 and 10 with configured services and user permissions. Physical Android packaging and testing are separate unfinished platform deliverables.


<!-- /coderabbit-ai-generated:v1 -->