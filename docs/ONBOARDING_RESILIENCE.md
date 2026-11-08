# Onboarding, interface sound and send recovery

This pass hardens the first-run experience and removes the last simulated defaults from the unmounted workspace prototype. It does not change the provider gateway, database schema or conversation API contract.

## First launch and language consent

- A language is now considered selected only when `afg_language` exists in local storage and names a supported locale. Browser/device language is a suggestion, never silent consent.
- Without a saved locale, the language screen is shown before the workspace and before account choices. Selecting a language persists it, applies the correct `lang`/`dir` values and then opens the existing welcome scene.
- Returning users with a saved locale skip the language screen. Settings and the experience panel still change the locale and update the account preference when signed in.
- Language, theme, planning and local-history reads/writes tolerate denied or unavailable storage. A blocked storage context keeps working for the current session instead of crashing before the first screen.
- The existing welcome remains owned by `JarvisShell`/`ExperiencePanel`; the unused duplicate intro branch was removed from `App.tsx`.

## Four-language shell and account gate

- `src/utils/coreCopy.ts` supplies reviewed English, Dari/Pashto/Persian and Arabic copy for application-level status, failures, assistant/terminal labels and the account gate.
- The account gate now renders Pashto, Persian and Arabic copy with the correct RTL direction instead of falling back to English.
- Other selectable locales still fall back to English for these shell strings until their copy is reviewed. The workspace chat, history and tools surfaces retain their existing localization gaps.

## Unsent prompt recovery

- The composer now records a short-lived pending send before calling the parent.
- `App.tsx` emits `afg-chat-send-accepted` only after a guest send is accepted or the signed-in user message has been persisted.
- If persistence fails, or an attachment is rejected, `App.tsx` emits `afg-chat-send-rejected` with the original text and attachments. The composer restores that draft and focuses the textarea instead of silently losing it.
- Local-only messages can now be removed from the current view even if the account API returns `404`. The UI displays an explicit warning when account storage could not delete the message; it does not claim the server row was removed.

## Original interface cues

- `src/lib/uiSound.ts` synthesizes short original cues with Web Audio: navigation, send, receive, success, error and notice. It uses no audio files, copyrighted material, music loops or network requests.
- Cues are opt-in through the experience panel, default to 30% volume and never autoplay before a user gesture. Mute and volume persist in `afg_visual_preferences_v1`. Duplicate cues within one gesture are throttled.
- The welcome chime remains the separate explicit `AfgCinematicIntro` control; the two systems do not start each other.

## Removed simulated defaults

- The unmounted `src/workspace` prototype no longer returns mock chat, shell, media or fabricated seed conversations. Its chat and terminal functions fail clearly until connected to the real API.
- `DEFAULT_MODEL` is empty. Gemini is not a default, required or silently selected provider.
- The unused `@google/genai` package was removed from `package.json`.
- The legacy settings “about” panel no longer claims a Gemini-powered core or ChatGPT branding.

## Verification

- `npm run lint` — passed.
- `npm run build` — passed; existing large-chunk and CSS optimizer warnings remain.
- `npm run i18n:check` — passed, 18 locales × 113 keys.
- `npm run test:afg-experience` — passed (activity truth, cancellation, graphics/sound preferences, denied storage, four-language experience copy).
- `npm run test:core-copy` — passed (four-language core/auth key parity, non-empty reviewed values, English fallback).
- `npm run test:ui-sound` — passed (mute, zero volume, cue synthesis, duplicate throttle).
- `npm run test:jarvis-command` — passed.
- `npx tsx scripts/test-chat-stream.ts` — passed.
- `npx tsx scripts/test-jarvis-task-storage.ts` — passed.
- Cloud Chromium: fresh-profile language gate, Arabic welcome, Arabic experience/sound panel, sound persistence and Arabic account gate inspected. No JavaScript exception was observed. The preview returned expected `503` responses for provider/database-backed APIs because this workspace has no configured PostgreSQL/provider secrets, and the preview host rejected `/manifest.webmanifest` with `403`.
- `scripts/test-media-engine.ts` was not run successfully because its required media environment variables (including the upload quarantine directory) are absent in this workspace.

## Remaining work

- Complete reviewed localisation of chat, history, tools, media and admin surfaces for all four required languages.
- Runtime-verify signed-in conversation persistence, edit/delete synchronization and draft recovery against a disposable PostgreSQL instance and a verified provider.
- Verify generated sound output on a physical Android 10 device, including battery/audio-focus behaviour.
- Media engine, image generation, voice and research remain capability-gated and require their external services.
