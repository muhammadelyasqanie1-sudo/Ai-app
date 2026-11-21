# Changelog — `feature/afg-ai-complete-product`

Branch base: `main` @ `23c82be0` (merge of feature/afg-ai-windows-desktop)
All changes are additive and verified with `tsc --noEmit`, `vite build`,
`i18n:check` (18 locales x 113 keys) and the DB-free regression scripts.
Nothing is faked: every capability below is wired to the existing real backend
endpoints, and features that still require external configuration remain gated
and honestly reported.

## Commits

| Commit | Summary |
|---|---|
| `68387726` | docs: repository audit 2026-11-22 and phased completion plan |
| `169788bf` | fix(p0): rate-limit regex, shadowed admin route, browser tool abort, UI fixes, repo hygiene |
| `8ac117df` | feat(voice): real STT/TTS/vision on the OpenAI-compatible adapter |
| `d924180e` | feat(admin): in-app admin console consuming the real /api/admin surface |
| `0f1a6da5` | chore(repo): remove unreferenced aistudio assets, ignore generated android/ |
| `b5797747` | fix(gitignore): anchor /android/ to repo root |
| `4c956199` | feat(chat): server-side assistant message persistence (Phase 3) |
| `b8aacdf7` | chore(repo): remove verified-dead mock UI code (audit P0-14 / P1-10) |
| `41466f8b` | ci: restore broken main triggers, add PostgreSQL integration and ClamAV media jobs |
| `ab6fc573` | build(deploy): production Dockerfile, Render blueprint and verified boot test |
| `2ae6caa8` | feat(image): real generateImage/editImage on the OpenAI-compatible adapter |
| `959de4e6` | chore(db): migration ledger policy, duplicate-number guard, 9999 truth |

## Phase 3 (2026-11-22, this run)

1. **Server-side assistant message persistence — the top persistence gap is
   closed.** The chat handler now verifies conversation ownership itself,
   stores the final user message as an idempotent safety net, accumulates the
   streamed reply and writes it before ending the SSE stream: status
   `complete` on success, `cancelled` (abort/timeout) or `failed` (provider
   error) with the partial content on interruption — the case that used to
   lose the reply forever when the tab closed. Writes go through
   `src/api/chatPersistence.ts`: insert-or-upgrade semantics where a later
   successful retry upgrades a partial `cancelled`/`failed` row to
   `complete`, and a `complete` row is never rewritten or downgraded. A new
   `persisted` SSE event tells the client, which keeps its own POST only as a
   fallback for old servers and now treats HTTP 409 (already stored) as
   success instead of showing a save-failure banner. Image-generation turns
   are persisted too (they were never saved before). Guests remain stateless
   by design; no schema change was required.
2. **Verified-dead mock UI code removed (~3k lines).** `src/workspace` (17
   files, self-admitted mock, not built or served) and 14 unreferenced
   components (old ChatGPT-clone skeleton + AfgHeader/AfgNavigation/
   AfgLlmApiCatalogPanel) were deleted after import-graph verification.
   `AfgHomeView` and `AfgLanguageModal` were checked and are LIVE — the
   audit was wrong, they are kept.
3. **CI was silently dead on main.** `ci.yml` and `i18n-build.yml` contained
   corrupted triggers (`branches: ain]` instead of `[main]`), so the main CI
   and i18n workflows could never run — the earlier audit verification that
   cleared this was mistaken. Fixed byte-exact; ci.yml now also runs all
   DB-free regression suites, a PostgreSQL 18 service job with real
   migrations + integration suites (conversation isolation, Phase 3 chat
   persistence, agent engine) and a ClamAV media-engine job.
4. **Deployment artifacts grounded in a verified boot.** Multi-stage
   non-root Dockerfile (migrations on start; tsx moved to production deps
   because `npm start` executes server.ts with it; full `scripts/` required
   by the scheduler import) plus a Render Blueprint with the managed TLS
   PostgreSQL, preDeploy migration, health check and honest `sync:false`
   secrets. `scripts/test-runtime-boot.sh` verifies the exact runtime path
   on embedded PostgreSQL: migration, tsx boot, HTTPS-308 policy,
   X-Forwarded-Proto health 200, dist static serving, CSP/HSTS headers.
5. **Real image generation/editing on the adapter layer.**
   `generateImage`/`editImage` were declared but unimplemented, which kept
   the image-generation capability gates permanently closed. Both are now
   implemented on the OpenAI-compatible adapter through the existing
   bounded `compatibleMedia` path (inline base64 only — remote URLs are
   never fetched, preserving the SSRF-safe policy), with the exact
   verified model id required (no substitution), aspect→size mapping,
   style presets as documented prompt suffixes, and mask support forwarded
   as its own multipart field.
6. **Migration ledger truth.** Renumbering the eight duplicate-number pairs
   would break deployed `schema_migrations` ledgers, so they are frozen and
   documented instead; `9999_settings_hub.sql` was verified to be a LIVE
   migration (`system_config` is actively read/written by the admin API and
   9Router — the audit claim was wrong). `npm run test:migrations` guards
   against new duplicate numbers, byte-identical files and table drops.

## Fixed (P0)

1. **User/tier rate-limit policies were never enforced.** `src/api/http.ts:74`
   contained `\\s` inside a regex literal, so the session-cookie test always
   failed and `enforceAdminConfiguredRateLimits` returned early for every
   request. Fixed to `\s` (same pattern already used at line 150).
2. **Browser tool ignored request cancellation.** `src/api/chatHandler.ts` now
   passes `abortController.signal` into `executeBrowserAutomationTool`
   (signature already supported it), so a cancelled chat request stops the
   in-flight browser session.
3. **Shadowed duplicate admin route.** `GET /api/admin/providers` was defined
   twice in `src/api/adminHandler.ts`; the second block (lines 938-956) was
   unreachable. Removed it plus the unused `requireAdmin` helper and the
   unused `invalidateProviderHealth` import.
4. **Broken TypeScript build on main.** `AfgJarvisView.tsx` referenced
   `model.sizeBytes` which does not exist on `OfflineDownloadState`
   (`npm run lint` failed on pristine `main`). Fixed to `downloadedBytes`
   (actual verified download size).
5. **Ctrl/⌘+K was hijacked.** `JarvisShell` intercepted the shortcut in the
   capture phase with `stopImmediatePropagation`, making the app command
   palette unreachable via keyboard. The shell no longer touches ⌘K; the
   palette keeps the shortcut.
6. **Video tab opened the wrong studio mode.** `AfgVideoGenView` now opens
   Media Studio with `video_generate` instead of `video_analyze`.
7. **Broken guest avatar.** `AfgChatView` rendered `<img src="">` for guests;
   an initial-letter avatar is rendered when no avatar URL exists.
8. **Windows desktop CI could never succeed.** `npm ci` requires a lockfile;
   the repository had none. `package-lock.json` is now committed
   (generated by npm install with the current dependency tree).
9. **Needle 3 mirror fallback was broken.** `scripts/download-needle-android.sh`
   installed a malformed package spec and called an `hf` binary that was never
   installed. Now uses `'huggingface_hub[hf_xet]>=0.34'` and
   `python -m huggingface_hub.commands.huggingface_cli`.
10. **Repo hygiene.** Removed the `.aistudio/` scratch artifacts and the 7.2 MB
    of unreferenced `public/assets/aistudio` PNGs; anchored `/android/` in
    `.gitignore` to the repo root (plugin `android/` sources stay tracked).

## Feature completions

1. **Server-side voice (STT/TTS) is now reachable end-to-end.** The
   OpenAI-compatible adapter (inherited by both the 9Router and APInex
   adapters) implements `transcribe` -> `/audio/transcriptions`,
   `synthesize` -> `/audio/speech` and `analyzeImage` -> vision
   `/chat/completions`, all through the existing bounded `compatibleMedia`
   path. `voice.ts` passes the exact verified model ID and a 55 s abort signal
   (no silent model substitution). `/api/voice/voices` returns only the honest
   provider-default voice. The admin voice enable-gate can now pass whenever a
   provider catalog advertises verified `stt`/`tts` models.
2. **In-app Admin Console** (`AfgAdminConsole`, lazy-loaded, en/dari/pashto/
   arabic): consumes the previously UI-less but fully real `/api/admin/*`
   surface — overview metrics and operational alerts, system health with last
   migration, user list with suspend/activate, feature-flag toggles (server
   readiness gates still decide), provider status + model discovery, model
   enable/disable, audit log and security event viewers. Shown in the shell
   navigation only for admin/superadmin; authorization remains server-side.
3. **Deployment/env truth.** `.env.example` no longer advertises dead variables
   (TERMINAL_*, CLI_TOKEN_TTL_DAYS, CLI_RATE_LIMIT_PER_HOUR, PACK_*,
   OFFLINE_SYNC_DEFAULT, AFG_MCP_SANDBOX_*); the provider-order example no
   longer lists the removed `cloudflare` provider; documented the
   used-but-missing variables (OPENAI_COMPAT_*, BEATAPI_*,
   AFG_AI_9ROUTER_BRIDGE_TOKEN, AFG_CONNECTOR_MONITOR_SECRET, knowledge-worker
   bounds, DATABASE_SSL_CA, terminal-worker bounds, AFG_AI_APP_URL).
   `electron/main.cjs` reads `AFG_AI_APP_URL` instead of a hardcoded URL.
   `package.json` renamed `chatgpt-clone` -> `afg-ai`.

## Documentation

- `docs/AUDIT_REPOSITORY_2026-11-22.md` — full four-layer audit with verified
  evidence (Persian).
- `docs/AFG_AI_COMPLETION_PLAN.md` — phased roadmap with acceptance criteria
  (Persian).

## Verification actually run

- `npm run lint` (`tsc --noEmit`): PASS (also fixed the pre-existing failure).
- `npm run build` (vite production build): PASS.
- `npm run i18n:check`: PASS (18 locales, 113 keys each).
- DB-free regression scripts: PASS (`offline-sha`, `offline-download`,
  `database-config`, `admin-rbac`, `core-state`, `chat-stream`,
  `chat-persistence`, `image-adapter`, `migrations`, `knowledge-engine`,
  `osint-engine`, `jarvis-command-engine`).
- PostgreSQL integration suites (user-space embedded PostgreSQL 18 via
  `scripts/run-integration-tests.sh`): PASS for `conversation-isolation`,
  `chat-persistence-integration` (new Phase 3 suite) and `agent-engine`.
- Runtime boot verification (`scripts/test-runtime-boot.sh`): PASS
  (migrations, production server boot, HTTPS policy, health, static dist,
  CSP/HSTS).
- Not run (requires external resources): the media-engine integration suite
  needs ClamAV (`clamscan`), which cannot be installed without root — the
  suite fail-closes by design and runs in the dedicated CI job; provider
  smoke tests need real NINEROUTER/APINEX keys; Android APK compilation and
  Windows electron-builder packaging run in their existing CI workflows.
- Not pushed: GitHub push credentials are unavailable; all commits live on
  the local `feature/afg-ai-complete-product` branch.

## Known remaining gaps (honest list, from the audit)

- ~~Assistant messages are still persisted client-side~~ CLOSED in Phase 3:
  the chat handler stores both turns server-side with idempotency keys and
  the `persisted` SSE event (commit `4c956199`).
- ~~`src/workspace/*` mock prototype~~ REMOVED after verification in Phase 3
  (commit `b8aacdf7`). `vendor/OpenJarvis` (83% of tracked files, incl. a
  77 MB macOS binary) is dead weight beyond the three authenticated proxy
  routes — kept, because those live routes reference it at runtime; pruning
  it needs a dedicated packaging decision.
- ~~Image `generateImage`/`editImage` adapter methods unimplemented~~ CLOSED
  in Phase 3 (commit `2ae6caa8`) on the OpenAI-compatible adapter; image
  generation flows through the real Media Studio job pipeline and now also
  through the studio capability snapshot.
- ~~Duplicated migration numbers + the "dead" `9999` table~~ RESOLVED in
  Phase 3 without destructive renames (commit `959de4e6`): duplicates frozen
  and documented; 9999 verified live and kept.
- Light theme coverage on AFG views, deeper i18n coverage for the 14
  non-primary locales, and multi-instance WebSocket/queue fan-out remain
  open work.
- Provider smoke tests, Android APK and Windows packaging verification need
  real provider keys / CI runners (their workflows exist and are wired).
