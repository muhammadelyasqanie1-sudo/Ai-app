<!-- coderabbit-ai-generated:v1 -->

# JARVIS command center — implementation and setup

## Delivery scope
This change adds a working JARVIS web command center to the existing AFG AI platform. It is **not a completed personal operating system**. Native controls, provider execution, authentication, persistence, and offline inference retain the repository’s existing implementations and requirements. No replacement backend, new provider protocol, database schema, or native wrapper was introduced.

The supplied reference URL `https://github.com/GauravSingh9356/J.A.R.V.I.S` returned HTTP 404 during inspection. No code was imported from that repository.

## Implemented in this change

| Capability | Implementation and verification |
| --- | --- |
| Responsive command center | Permanent desktop navigation, configurable intelligence panel, mobile drawer and bottom navigation, reduced-motion behavior. Shared Chromium desktop and 390px mobile inspected. |
| Real service status | Bounded `/api/health` and `/api/ready` requests, refresh and 30-second polling. Database failure stays unavailable. Browser network signal is identified as a signal, not proof of Internet reachability. |
| Model selection | Uses the existing discovered model descriptors and provider-qualified identifiers. Unselectable entries remain disabled. No invented model inventory. |
| Conversation entry | Dashboard composer and prompt cards call the existing chat send handler. Existing SSE, cancellation, retry, message/history and auth paths remain in place. Home composer offers cancellation while generation runs. |
| Local tasks | Add, complete/reopen, delete, JSON export, 500-task and 300-character limits. Browser-local persistence; storage errors shown and malformed data preserved without overwriting. Offline creation survives online reconnection and reload. |
| Local documents | User-selected text, Markdown, CSV, JSON, XML, HTML and common source files, maximum 2 MB. Preview and line search run entirely in the browser. No upload or automatic AI disclosure. Contents are rendered as text. |
| Voice entry | Explicit browser speech recognition start/stop, visible recording state, permission/error reporting, transcript review before sending. Browser vendors may process audio remotely. No background listening. |
| Navigation integration | Existing chat, image/video studio, tools, coding terminal, history, settings, local-model hub and native JARVIS controls remain reachable. |
| Brand and accessibility | JARVIS favicon, localized document title, labeled controls, inert closed mobile drawer, keyboard command focus, responsive layout without horizontal overflow. |

## Existing capabilities and requirements

| Area | Existing implementation | Remaining verification or work |
| --- | --- | --- |
| Authentication/sessions | Existing Express/PostgreSQL account and CSRF paths | No configured database in this sandbox; end-to-end sign-in and isolation not exercised. |
| AI inference | Existing 9Router/APInex adapters and database-registered Ollama | No verified models available in this sandbox; generation, provider switching and streaming remain unverified here. |
| Offline generative AI | Existing WebLLM model hub and native llama runtime | Requires compatible hardware and downloaded model assets. No model downloaded or loaded in this turn. |
| Memory | Existing authenticated account memory service and Settings controls | Not tested against a configured database. Command center does not silently save memories. |
| Research/browser | Existing research tools and authenticated browser backend | Requires configured search/browser services and appropriate account permissions. No live research execution verified. |
| Media | Existing capability-gated image/video screens | Requires compatible provider; no media generated. |
| Coding | Existing terminal and project inspection tools | Secure arbitrary execution is not added by this change. |
| Devices | Existing Capacitor Android JARVIS bridge | Browser cannot perform Android OS controls; APK build and physical-device permission tests outstanding. |
| Workflow automation | Existing individual tools remain accessible | Visual workflow graph, scheduler and resumable execution runtime are not implemented. The UI states this explicitly. |
| Knowledge retrieval | Local document viewing and existing intelligence tools | No new semantic index, vector database, or cross-file retrieval implemented. |
| Synchronization | Existing authenticated APIs | New local tasks are not synchronized across devices and are not encrypted. They are shared within this browser profile, not isolated by signed-in account. |
| Localization | Existing locale handling and centralized new navigation copy for English, Dari, Pashto, Persian, Arabic | New dashboard/local tool body text remains English. Full string centralization and translations are outstanding; do not claim complete multilingual coverage. |
| Native platforms | Existing Android wrapper and web app preserved | No Windows/macOS/Linux desktop package or iOS build added. |

## Start locally

Use Node.js 22+ and the repository’s npm setup. This sandbox already has Node 24.21.0, npm 11.19.0 and prepared dependencies.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The local workspace opens directly without requiring an account. This intentionally changes the former cinematic-intro/login-first startup; authenticated server APIs still enforce their existing session and permission requirements. Sign-in is available from the profile control. No provider secrets are requested or stored in the command-center browser UI.

For a production build, use the existing commands:

```sh
npm run build
npm run start
```

The repository has no lockfile; reproducible dependency resolution is an existing limitation. Existing production API-base defaults differ among legacy components. Review `VITE_API_BASE_URL` and use one explicit intended backend before deployment; a local preview is not evidence that production API routing is correct.

## Server configuration

Use `.env.example` and the existing deployment guide. Keep secrets only on the server.

- `DATABASE_URL`: PostgreSQL connection from your database administrator or hosting provider. TLS settings are in `.env.example`.
- `NINEROUTER_BASE_URL`: your administered 9Router service. `NINEROUTER_API_KEY` is needed when its API-key requirement is enabled. This service supplies the configured inference providers.
- `OLLAMA_BASE_URL`: existing Ollama service on the backend host. The existing adapter requires a loopback HTTP endpoint and an enabled database provider record. It does not access an arbitrary user laptop from a remote web server.
- `APP_ORIGIN`: intended production HTTPS origin, supplied by the deployment administrator.
- `AFG_INTEGRATION_ENCRYPTION_KEY`: existing server vault key, needed before storing authenticated connector credentials. Follow the existing secret-generation instructions.
- Search, browser, OAuth, email and other integrations retain their documented environment and permission requirements.

For account features, review and apply the repository’s existing ordered migrations with the migration guide and a backup/recovery plan. No migrations or production configuration were changed or applied in this turn.

## Local data and privacy

Tasks use `jarvis-local-tasks-v1` in localStorage. Export tasks before clearing browser storage. Invalid existing data is preserved and writes are blocked: recover the raw entry with browser developer tools, then remove only that entry if you intend to reset it. No automatic migration or task import is provided. Files are held in memory only until the view closes. Local tasks and files do not automatically become model context.

Browser speech is user initiated and may require an online browser speech service. This is not an offline speech implementation. Cloud AI and research never become available merely because browser-local tasks work offline.

## Verification

Executed successfully:

- TypeScript: `npm run lint`.
- Production client + existing locale key gate: `npm run build`.
- `npm run test:database-config`.
- `npm run test:admin-rbac`.
- `npm run test:offline-sha` (five vectors).
- `npm run test:jarvis-command`.
- `npx tsx scripts/test-jarvis-task-storage.ts`: valid records, malformed JSON/schema, duplicate identities, task/title limits and denied storage.
- Shared cloud Chromium: dashboard, task persistence across reload, completion, deletion, offline task creation followed by online reload, local text preview and search, mobile navigation, keyboard composer focus, settings navigation.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4d0aaa83c350aaedd6d89d9ab92b8f0107cb08315ffdced6f7cd34ee181290e4 -->

- Final accessibility scans: desktop overview 37 passes and zero detected violations; mobile overview 34 passes and zero detected violations. Both retain one incomplete gradient contrast check for manual review.
- Missing-provider failure path: the user prompt was preserved and a visible retryable error with request ID appeared. This is not a successful inference test.
- Corrupted local task storage: the UI displayed an error, preserved the raw record, and retained the unsaved draft; synthetic data was cleaned up after verification.

<!-- /coderabbit-ai-generated:v1 -->

Build warnings remain for existing CSS escape selectors, large bundles and future Vite native configuration-loader compatibility. This is not a production security audit or release certification.

Not exercised: actual provider inference/streaming/cancellation, microphone recording, offline model loading, production account flows, database-backed synchronization, media generation, browser automation, native APK/device behavior, or deployment.

CodeRabbit Emulate v0.0.1 was installed from the pinned verified source and its bundled service catalog inspected. That catalog contains no replacement for the inference gateway, Ollama, or PostgreSQL. No unrelated emulator was started and no provider traffic was redirected.

## Dependency-aware next phases

1. Configure an isolated PostgreSQL instance and inference gateway, review migrations, then exercise sign-in, ownership boundaries, streaming, cancellation, and provider/model switching with real configured services.
2. Complete centralized body copy and reviewed translations; verify RTL across all legacy screens, light/system themes, contrast and touch targets.
3. Verify installed offline models on supported WebGPU/native hardware, including disconnect/reconnect and model download integrity.
4. Add bounded durable workflow execution and a real approval-aware visual builder against the existing tool registry.
5. Build secure file ingestion/extraction and semantic collections, then synchronize explicitly selected local data with conflict/version controls.
6. Package and verify native Android/desktop/iOS targets individually; make only platform-supported promises.

Branch: `coderabbit/build-jarvis-ai-platform/bc03bec2`. Base: `cd9c179d4ba06274c22b180e7326fe269fc3724c`. Changes are left uncommitted for review; no push or deployment was performed.
