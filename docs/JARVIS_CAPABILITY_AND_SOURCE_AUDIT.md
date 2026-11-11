# JARVIS capability and source integration audit

Audit date: 2026-11-09
Target: `muhammadelyasqanie1-sudo/Ai-app-test` (`main`)
Target base commit: `a1e1c11b7ac43d36c028af7a90f0463befc4b368`

## Executive finding

This repository is **not a complete, installable JARVIS Android application yet**. It contains a large OpenJarvis source snapshot, an AFG AI Capacitor Android bridge, local command parsing, task-storage code and integration documentation. The root repository does not contain the host app's root `package.json` / complete Capacitor Android project, so an APK build cannot be proven from this repository alone.

Do not restart from zero. Preserve and extend the existing JARVIS implementation. Do not claim that a feature is available merely because upstream source code is present under `vendor/`.

## Existing implementation verified in the target repository

- `vendor/OpenJarvis/`: 2,203 files from the upstream OpenJarvis snapshot are already present.
- `plugins/capacitor-jarvis/`: Capacitor 8 Android plugin, Java native bridge, manifest and accessibility service.
- `src/lib/jarvis-command-engine.ts`: deterministic allowlisted command parsing for English, Afghan Dari, Persian, Pashto and Arabic.
- `src/lib/jarvis-local-agent.ts`: local agent logic.
- `src/components/jarvis/taskStorage.ts`: task persistence.
- `src/api/openjarvis.ts` and `services/openjarvis/`: private-server bridge and deployment contract.
- `scripts/test-jarvis-command-engine.ts`, `scripts/test-jarvis-task-storage.ts`, `scripts/test-openjarvis-redaction.ts`: tests exist; the redaction integration test needs the host application's missing support files and a PostgreSQL test database.
- `docs/JARVIS_ANDROID.md`, `docs/OPENJARVIS_FULL_INTEGRATION.md`: existing implementation and integration boundaries are documented.

### Existing Android capabilities described by the current source

- User-invoked AccessibilityService actions: Back, Home, Notifications, Quick Settings, scrolling, clicking visible text and entering text into the focused field.
- App launch, Android speech recognition and TextToSpeech.
- Explicit, permission-gated access to selected device information and tools: battery, network state, sensors, flashlight, cached location, contacts, limited recent SMS, camera intent, clipboard, dialer and SMS composer.
- A local allowlist command parser; unknown or ambiguous commands are not executed.
- llama.cpp / GGUF and a constrained Needle runtime are described in the Android integration documentation.

These are not equivalent to unrestricted device control, continuous antivirus, theft recovery, or a complete background bodyguard.

## Source projects checked

| Source | Current target status | Useful capabilities | Constraints / decision |
|---|---|---|---|
| [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | Already imported under `vendor/OpenJarvis/` | Local-first agent framework, tools, skills, memory, operators, MCP and Python service | Keep its existing Apache-2.0 snapshot; runtime bridge and multi-user isolation still have explicit limits. |
| [Mark-X.1](https://github.com/FatihMakes/Mark-X.1) | Not found in target tree | Small Python desktop assistant: app launch, WhatsApp messaging, web search, weather, short/long-term memory, speech I/O | Desktop-oriented; README says personal/educational use and no commercial use. No clear license file. Do not silently merge into an AFG commercial product. Reuse only after license permission is resolved. |
| [Mark-LVI](https://github.com/FatihMakes/Mark-LVI) | Not found in target tree | Desktop automation, browser/computer control, file/document handling, monitoring, reminders, voice/avatar | Python/PyQt desktop app; requirements include Google Gemini Live and desktop-only automation dependencies. Its LICENSE is CC BY-NC 4.0 (non-commercial only). Do not ship its code in a commercial AFG AI build without separate permission; do not make Gemini a default. |
| [VoiceStudio](https://github.com/debpalash/VoiceStudio) | Not found in target tree | Local speech generation, transcription, dictation, voice design/cloning and Android mobile source | Upstream tree is 4,812 files / about 113.2 MB of tracked source; AGPL-3.0. Android/mobile source exists, but importing the entire desktop/backend project is not the same as integrating a voice engine. Review its mobile module, model licensing, runtime requirements and AGPL obligations before copying/redistributing. |
| Fourth previously shared JARVIS repository | URL not recoverable from available conversation context | Unknown until exact source URL is known | Do not guess a repository or import an unrelated project. |

## Required JARVIS product capabilities and actual gaps

| Capability | Current evidence | Work still required |
|---|---|---|
| Voice conversation | Android SpeechRecognizer + TTS; provider-dependent | Reliable wake word, streaming conversation, language-specific voice packs, interruption/barge-in, foreground-service lifecycle and offline fallback tests. |
| General task worker | OpenJarvis source and local agent | AFG-authenticated tool router, durable job queue, progress, cancellation, retry, audit trail and per-user data isolation. |
| Phone controls | Limited Capacitor bridge and AccessibilityService; typed capability registry and a guarded `AfgJarvisView` dispatcher are implemented on PR #1's feature branch. | Add independent native-side enforcement, inventory every other plugin caller, and validate each action on Android 10 and newer devices. The UI policy is not a native security boundary; Accessibility must remain user-enabled and visible. |
| Phone bodyguard | A user-confirmed local exposure review is implemented on PR #1's draft branch: screen-lock state, ADB status, Android security-patch string, AFG AI Accessibility state, and sensitive permissions requested/granted by up to 100 launcher-visible apps. | Still needs an opt-in sideload/install-source review, phishing/link checks, network warnings, file-integrity/backup checks and a user-triggered incident report. The current inventory omits hidden/non-launcher apps and is not malware detection or antivirus. |
| Theft / emergency protection | Not verified | Opt-in emergency contacts, user-configured lost-device workflow, location sharing only with consent, and documented limits when the phone is offline, powered off or permissions are revoked. |
| Files and documents | OpenJarvis tools exist upstream; device bridge is limited | Sandboxed file picker, scoped storage, preview, backup/restore and explicit confirmation for destructive actions. |
| Messaging and calling | Android intents documented | User confirmation in system composer; do not silently send messages or place calls. |
| Browser / web tasks | OpenJarvis tools exist upstream; Mark-LVI is desktop-only | Mobile browser integration through approved Android intents or a controlled browser session; allowlist and confirmation for consequential actions. |
| Smart home / IoT | Not verified as integrated | Explicit connector setup, least-privilege tokens and per-device confirmation. |
| Offline intelligence | llama.cpp / Needle documented | Real-device memory/latency/battery tests, model download integrity, storage budget and tested Dari/Pashto models. |
| Android background protection | No always-on guardian verified | Android foreground-service notification, battery-optimization handling and OS-policy review; never promise invisible or unkillable monitoring. |

## Safety and Android platform boundaries

- Android applications cannot silently control every app, read arbitrary app-private data, bypass lock screens, intercept all messages, or guarantee recovery after uninstall, factory reset, power-off or network loss.
- AccessibilityService is a sensitive user-enabled capability. Use it only for user-visible, consented accessibility/task actions; never as hidden surveillance.
- SMS/contacts/location/camera/microphone/clipboard are sensitive. Ask only at the point of use, explain the purpose, minimize retention and never upload by default.
- Destructive actions, payments, external messages, account changes, installing apps, and security-setting changes require a clear confirmation step.
- A background service must show the Android-required notification and respect OS battery and permission controls.
- Keep provider keys on the server; do not expose credentials in the APK or browser bundle.

## Integration sequence (extend existing code; do not rebuild)

1. **Baseline and reproducibility:** restore the complete host AFG AI app/build context needed to compile this isolated JARVIS repository; run existing command-engine and task-storage tests; run Android lint/unit tests and an API-29 emulator/device build.
2. **Capability router:** unify current native methods, local parser, OpenJarvis tools and future tools behind typed capabilities with permission scopes, risk levels, user confirmation, timeouts and audit events.
3. **Bodyguard foundation:** implement a transparent local security center with permission/app inventory, security checks and safe alerting; no unsupported malware-detection claims.
4. **Voice engine:** review and selectively integrate VoiceStudio mobile/native speech components only after license, model-license, build and Android compatibility checks; retain Android TTS/STT fallback.
5. **Task worker:** connect OpenJarvis agents to AFG sessions through private authenticated routes; implement per-user memory/state isolation before exposing persistent agents to multiple users.
6. **Mobile actions:** add verified, scoped Android intents and APIs; keep privileged or unavailable actions visibly unsupported rather than simulating success.
7. **Security review and release:** permission audit, dependency/SBOM review, secret scan, offline tests, accessibility disclosure review, Android 10+ real-device tests and regression suite.

## Implementation and verification addendum — 2026-11-09

A follow-up security foundation is now proposed in [PR #1](https://github.com/muhammadelyasqanie1-sudo/Ai-app-test/pull/1), on branch `feat/jarvis-complete-capability-foundation`. It remains a **draft** and has not been merged.

### Implemented on the feature branch

- Added a typed JARVIS capability registry with risk levels, confirmation requirements, Android permission requirements, foreground-only execution and fail-closed unknown-capability handling.
- Corrected location permission semantics: Android approximate **or** precise location permission is sufficient; the app must not require both.
- Added policy checks to the shared `AfgJarvisView` action dispatcher. All action keys used by that screen now map to a registered capability; unknown keys are rejected before the native task is called.
- Moved microphone, camera/torch, location, contacts and SMS permission checks into the policy preflight. The user-facing UI asks for confirmation before microphone capture and clipboard read/write as well as existing high-impact actions.
- Kept SMS reading, shell execution, code execution and payments disabled by default.
- Added GitHub Actions tests for the capability policy, dispatcher mappings, offline multilingual command parser/model guards, and local task storage/account scoping.

### Local phone security review added on the draft branch

The Android plugin now exposes `getSecuritySnapshot()`; the JARVIS screen calls it only after a user confirmation. The report reads the device secure-lock state (when Android exposes it), ADB setting, Android release/API/security-patch string, AFG AI Accessibility status, and a capped inventory of up to 100 launcher-visible apps with selected sensitive runtime permissions and whether Android grants them. The review separately checks AppOps modes for apps requesting draw-over-other-apps, write-system-settings and install-unknown-apps special access. `allowed`, `default`, `foreground`, `ignored`, `errored` and `unknown` remain distinct states; a default or unknown state is never counted as allowed. It does not inspect app files, collect message/contact contents, upload the inventory or label an app as malware. Android package-visibility rules mean this is not a complete list of every installed package.

The capability is registered as `security.scan` and requires foreground execution plus explicit confirmation. CI now also checks the Android inventory method's permission list, result cap, package query scope and device-status fields. This is a local exposure review only, not antivirus protection.

### CI result

The GitHub Actions workflow `JARVIS capability safety tests` completed successfully on commit `36e05f1bd543835eec11cc81631bf093f3c552fb`. All four test steps passed:

1. Capability authorization policy.
2. Android action dispatcher enforcement.
3. Multilingual offline command engine and local model guards.
4. Local task storage validation and account scoping.

Run: https://github.com/muhammadelyasqanie1-sudo/Ai-app-test/actions/runs/42651436144

### Important remaining security and release gaps

- The capability policy is currently enforced in the React/TypeScript action dispatcher. It is a safety gate for this UI, **not a substitute for enforcement inside native Android methods or backend endpoints**. Another caller that invokes the Capacitor plugin directly could bypass the UI policy. The next security task is to make the native bridge validate its own call context and to search for every other plugin caller.
- The OpenJarvis bridge exposes authenticated status/model discovery and a chat-completions proxy with CSRF validation. The private OpenJarvis runtime uses one shared runtime home; per-user memory, traces, credentials, skills, agent state and schedules are not tenant-isolated. Keep it single-owner/private until isolation and authorization are implemented.
- No root host `package.json` / complete Capacitor host project is present in this isolated repository. A full application TypeScript build, APK assembly, Android lint, emulator run or real-device run has **not** been verified.
- These tests validate logic and source wiring only. They do not prove physical-device behavior, speech-recognition quality, offline operation, or background protection.


## Verification status

- Target tree queried from GitHub: 2,246 files, 288 directories, not truncated.
- VoiceStudio tree queried from GitHub: 4,812 files, 425 directories, not truncated.
- Mark-LVI tree queried from GitHub: 78 files, not truncated.
- Mark-X.1 tree queried from GitHub: 20 files, not truncated.
- No source files from VoiceStudio, Mark-X.1 or Mark-LVI have been copied into the target in this audit step.
- No Android APK build, runtime integration test, or real-device security test has been run in this audit step.
