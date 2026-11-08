## AFG AI — Implementation Report

Milestone: first-launch onboarding, four-language shell/account copy, send recovery, interface sound and removal of simulated defaults.

Branch: `feat/afg-onboarding-resilience`

Commit: `485a6909d99c85e8facb4580ad51921bbbfd08e7` (pushed)

### ✅ Completed

- Explicit first-launch language consent — `src/App.tsx` — a language is selected only when `afg_language` contains a supported locale; the device language is a suggestion, not consent. Verified in Cloud Chromium with cleared storage: the language screen appeared, English selection opened the workspace, Arabic selection opened the Arabic welcome and workspace.
- Four-language shell and account copy — `src/utils/coreCopy.ts`, `src/App.tsx`, `src/components/afg/AfgAuthGate.tsx` — reviewed English, Dari, Pashto, Persian and Arabic copy for app-level status, errors and the account gate; correct `lang`/`dir` values. Verified by `npm run test:core-copy` and by the Arabic account gate in Cloud Chromium.
- Draft recovery after rejected sends — `src/components/afg/AfgChatInputCapsule.tsx`, `src/App.tsx` — pending send is acknowledged only after acceptance/persistence, and the exact text plus attachments are restored on synchronous rejection or storage failure. Covered by the code path and existing experience tests; signed-in persistence failure was not executed against PostgreSQL.
- Honest message deletion — `src/App.tsx` — local view removal no longer depends on a successful server delete; a warning is shown when account storage did not confirm deletion. Code inspection and type-check only.
- Original interface sound system — `src/lib/uiSound.ts`, `src/components/jarvis/ExperiencePanel.tsx`, `experience.ts`, `experienceCopy.ts`, `intelligence.css` — synthesized Web Audio cues, persistent mute/volume, no autoplay before a gesture, no audio assets or copyright material. Verified by `npm run test:ui-sound` and the Arabic settings panel in Cloud Chromium; actual speaker output was not audible to the agent.
- Storage resilience — `src/App.tsx` — language, theme, planning, permission and local-history reads/writes tolerate denied or unavailable storage. Type-check passed; the real browser storage-denied path was not reproduced after this change.
- Removed simulated defaults — `src/workspace/data.ts`, `src/workspace/api.ts`, `src/components/SettingsModal.tsx`, `package.json` — no default Gemini model, no Gemini dependency, no mock chat/terminal/media success and no seed conversations. Unconfigured paths fail explicitly.
- Documentation and regression tests — `docs/ONBOARDING_RESILIENCE.md`, `docs/AFG_EXPERIENCE.md`, `README.md`, `scripts/test-core-copy.ts`, `scripts/test-ui-sound.ts`, `scripts/test-afg-experience.ts` — passing checks listed below.

### ⚠️ Partially Implemented

- Four-language coverage — the application shell, account gate, welcome, experience panel and main workspace navigation are reviewed in the four required languages. Chat tools, history filters, media studio, admin surfaces and the remaining 14 selectable locales still contain English or older localized copy; they were not fully retranslated in this milestone.
- Interface sound mixing — cue synthesis, mute, volume, throttling and persistence are implemented. Loudness balancing and audio-focus behaviour on physical Android hardware remain unverified.
- Account send failure recovery — the UI contract and synchronous rejection paths are implemented and type-checked. A real server persistence failure followed by draft restoration was not executed because no disposable PostgreSQL instance/provider is configured in this workspace.

### 🔒 Configuration Required (env / provider)

- `DATABASE_URL` — PostgreSQL for accounts, sessions, conversations, preferences and rate limits — provide a disposable or production PostgreSQL connection string; run `npm run db:migrate`.
- `PROVIDER_KEYS_MASTER_KEY` — server-side AES-256-GCM key for the provider credential vault — generate 32 random bytes and base64-encode them; keep server-only.
- Provider credentials — configure through the admin/API connector, not frontend variables. A verified provider/model is required before chat, image, voice or research capabilities are advertised.
- `APP_ORIGIN` — canonical HTTPS origin for OAuth callbacks and account cookies when not same-origin.
- Optional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, `TAVILY_API_KEY`, media scanner/runtime paths per `.env.example`.
- No new environment variable was introduced by this milestone.

### 🧪 Not Verified (by design, per rules)

- `npm run lint` (TypeScript) — passed.
- `npm run build` — passed; existing large-chunk and generated-CSS optimizer warnings remain.
- `npm run i18n:check` — passed, 18 locales × 113 keys.
- `npm run test:core-copy` — passed.
- `npm run test:ui-sound` — passed.
- `npm run test:afg-experience` — passed.
- `npm run test:jarvis-command` — passed.
- `npx tsx scripts/test-chat-stream.ts` — passed.
- `npx tsx scripts/test-jarvis-task-storage.ts` — passed.
- Cloud Chromium fresh-profile test — passed for language gate, Arabic welcome/workspace/RTL, sound preference persistence and Arabic account gate; no JavaScript exception observed. The preview returned expected `503` responses for database/provider-backed APIs and `403` for `/manifest.webmanifest` on the preview host.
- No PostgreSQL migration, signed-in journey, provider smoke test, media/voice generation, deployment or physical Android test was run. No secret was configured or inspected.
- `scripts/test-media-engine.ts` was not run; its required media/quarantine environment is absent.

### 🚧 Recommended Next Steps

1. Provision disposable PostgreSQL and a verified provider, run migrations, then test signed-in send failure/draft recovery and delete synchronization end to end.
2. Complete reviewed four-language copy for chat tools, history, media, settings subpanels and admin, with RTL screenshots for each required language.
3. Measure audio levels and verify mute/volume/audio-focus on a physical Android 10 device, including reduced-motion and low-end performance.
4. Run provider, voice, image and media smoke tests only after their real credentials and runtimes are configured; keep unavailable actions disabled.
5. Address the existing bundle-size and generated-CSS warnings with measured, scoped follow-up work.

### 🧭 Known Limitations

- The app remains account-capable but not runtime-verified against a live database in this environment; guest mode is available.
- PostgreSQL/provider configuration is required for chat, history, voice, image generation, research and admin data.
- Localization is complete for the implemented four-language shell/auth/workspace surfaces, not every legacy panel or all 18 selectable locales.
- The browser preview host does not serve the PWA manifest (`403`); that is a preview-host limitation, not a production asset result.
- Sound cues were tested through a deterministic Web Audio stub, not by listening on a device.
- The current branch is pushed; no pull request was opened because GitHub CLI authentication is unavailable in this environment.
