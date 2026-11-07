<!-- coderabbit-ai-generated:v1 -->

# AFG AI multimodal foundation

This milestone extends the existing AFG AI application, provider gateway, authenticated file API and PostgreSQL agent queue. It does not implement every feature in Master Prompt 04. The inventory below distinguishes local verification from external inference.

## Architecture audit and changes

| Existing system | Reused implementation | Change |
| --- | --- | --- |
| React/Vite and JarvisShell | Existing image/video routes, themes, account session and command-center activity | Both routes open the same Media Studio; image, audio, documents and video metadata are operations within it. |
| Provider gateway | Discovery, enabled models, recent health verification, feature flags, server credentials and subscription authorization | Optional provider `executeMedia` contract; explicit endpoint/task declarations; no model-name guessing or automatic provider fallback. |
| 9Router/APInex/OpenAI compatible adapters | Existing configurable compatible adapter factory | Standard image generation/editing, vision chat, transcription and speech requests through the same server configuration. |
| PostgreSQL agent engine | Existing bounded queue, locks, status, cancellation, events and checkpoints | One private `media_execute` step per submitted media job. No second worker or queue. |
| Private files | Existing `files` table, quarantine root, quotas and owner authorization | Scan approval, signed-byte integrity checks, authenticated download, additional validated formats, pagination/search, output storage and audit records. |
| Chat, voice and local models | Existing chat/SSE, microphone permission flow, Ollama/WebLLM/native bridges | Preserved. Studio audio adapters are not yet connected to the legacy live voice-conversation pipeline. |
| Research/agents/Android | Existing backend tools and Capacitor plugins | Preserved; no new native operating-system capabilities claimed. |

No JARVIS-IMPLEMENTATION.md exists in the inspected checkout. Existing README, AGENTS.md, deployment/setup guidance, migrations, prior implementation reports and source were used. Starting revision: `21b7d5e26ce5f860194bfba2bb6cf1769772820e`; starting working tree was clean. No application dependency or deployment configuration was added.

## Feature inventory

| Capability | Status | Evidence or remaining requirement |
| --- | --- | --- |
| Authenticated media tasks, queue admission, IDs, owner history, cancellation and duplicate submission protection | Implemented and verified | Real PostgreSQL and HTTP tests. Per-account request-key uniqueness; changed input with the same key returns409. |
| Private upload/library, quotas, scanner gate, download/delete, integrity and symlink rejection | Implemented and verified | Actual local disk/SQL/HTTP; ClamAV exercised with a synthetic test signature database. Production malware coverage was not verified. |
| TXT, Markdown, CSV and JSON text extraction | Implemented and verified | Actual approved local files, UTF-8 validation and source references. This returns text; CSV/JSON are not transformed into inferred tables. |
| MP4/WebM container metadata | Implemented and verified | Actual ffmpeg-created test container processed by ffprobe. Duration/codecs/dimensions are parser output. |
| Image generation/editing, visual questions and OCR interpretation | Implemented but externally unverified | Compatible HTTP adapters and filtered UI exist. No live configured provider succeeded. Inline base64 or binary image output is required. |
| Speech transcription and speech generation | Implemented but externally unverified | Compatible multipart transcription and WAV speech adapters; explicit provider voice ID. Live model inference, audio playback and microphone-to-provider path not verified. |
| Text generation and text-document analysis | Implemented but externally unverified | Uses the existing verified chat service, explicit model and subscription gate. No live inference verified in this milestone. |
| Usage and cost tracking | Partially implemented | Stores provider-reported numeric usage when returned, measured job duration and nullable usage. No invented cost, tokens or wallet. Streaming text usage aggregation and billing budgets are not added. |
| History, files, pagination, search, manual retention and export | Implemented and verified for backend; browser export not downloaded during QA | File-name search; paginated jobs/files; text export control. Delete terminal job history and files separately. No automatic expiration or object-store backend. |
| Durable results and recovery | Partially implemented | Saved results are reused; queued work is dispatched on history access. Interrupted work requires explicit inspection/recovery in Automation. Billed operations are never automatically replayed. Process-kill restart was not tested. |
| Media Studio, mobile layout, dark/light and RTL | Implemented and verified | Shared cloud Chromium desktop,390px mobile and820px tablet checks. English/Dari UI and automated accessibility checks; other requested dictionaries checked by TypeScript. |
| Dedicated video generation and asynchronous provider polling | Not implemented | Existing 9Router passthrough remains separate. No verified persistent video generator, webhook or provider cancellation integration is advertised. |
| Scene summaries, frame extraction, thumbnails, video visual questions | Not implemented | Video analysis currently means container metadata only. |
| PDF/DOCX/XLSX/PPTX extraction, scanned-document OCR pipeline | Not implemented | PDFs can be quarantined, but document operations reject them. Image OCR is model interpretation, not verified extracted text. |
| Image variation/upscaling/background removal, advanced editing masks | Not implemented | No unsupported controls displayed. |
| Audio understanding, speaker separation, streaming speech and voice discovery | Not implemented | Audio Studio accepts uploaded transcription input and speech text/voice IDs. No fabricated voice list. |
| Android-specific camera, sharing, background downloads or notifications | Partially implemented in pre-existing platform only | Browser file picker/media controls remain available. No new native integration or physical-device verification. |

## Database migration

Run the existing migration command using the deployment's PostgreSQL configuration:

~~~sh
npm run db:migrate -- --status
npm run db:migrate
~~~

Migration `0050_multimodal_jobs.sql` creates owner-scoped `media_jobs` records referencing `agent_tasks`; adds `files.media_job_id` and `files.metadata`; and adds indexes/RLS without public policies. Binaries stay on private disk. It does not drop or reset data, and no existing migration was changed. Tested application and repeat application only against a disposable local PostgreSQL16 database. Production application remains an operator action.

## Configuration reference

| Variable / setting | Purpose and source |
| --- | --- |
| DATABASE_URL, DATABASE_SSL and existing TLS/pool settings | Existing PostgreSQL connection supplied by the database administrator. All migrations must be applied. |
| AFG_UPLOAD_QUARANTINE_DIR | Existing absolute private storage directory outside the application/public tree. Attach persistent storage on Render/Railway; ephemeral disk does not provide durable media. |
| AFG_CLAMSCAN_PATH | Absolute path to a real ClamAV `clamscan` executable installed by the host administrator. Empty disables approval. |
| AFG_CLAMSCAN_DATABASE | Optional absolute signature database path; empty uses ClamAV defaults. Maintain official signatures with freshclam. The QA synthetic database is not suitable for production. |
| AFG_FFPROBE_PATH | Optional absolute ffprobe executable path; default `/usr/bin/ffprobe`. Install FFmpeg tools on the hosting image for metadata inspection. |
| AFG_MEDIA_TASKS_JSON | Optional JSON object mapping exact `providerId::discoveredModelId` to supported operation names. Use only after checking the provider's documented endpoint support. Invalid configuration is reported by the capability API and disables these supplemental declarations. |
| OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_PROVIDER_ID, OPENAI_COMPAT_DISPLAY_NAME | Existing server-only compatible provider configuration, supplied by the chosen provider. Existing Admin-stored encrypted provider configurations and 9Router/APInex settings remain supported. No browser API key. |
| AFG_AI_PROVIDER_ALLOWLIST | Existing optional provider allowlist. Honored by model discovery. |
| AFG_AGENT_CONCURRENCY, AFG_AGENT_TIMEOUT_MS | Existing agent limits. Media uses the same global queue; provider calls are additionally bounded to55seconds. No long-running video worker was added. |
| Admin feature flags | `image_generation_enabled` for generation/editing; `voice_enabled` for speech; `chat` for text, vision and document analysis. Discover and enable actual models in Admin, and satisfy existing subscription gates. |

Example syntax for an administrator's documented, exact model IDs (replace both placeholders; this does not configure credentials or create models):

~~~json
{"provider-id::discovered-model-id":["image_generate"]}
~~~

Supported supplemental declarations: `image_generate`, `image_edit`, `image_understand`, `ocr`, `speech_recognize`, `speech_generate`. Without a supplemental declaration, the live catalogue must declare both the modality and matching compatible endpoint. An image output modality alone does not prove support for `/images/generations`.

Availability means configured, enabled, recently health-checked and declared compatible. It does not mean a media inference was successfully performed. Some compatible providers expose sparse catalogues or probe non-chat models differently; they may need richer gateway metadata and administrator configuration. No model names, voices, prices or advanced options are invented. Manual selection is retained; there is no silent provider fallback.

Compatible request formats were checked against [official image documentation](https://developers.openai.com/api/reference/resources/images/methods/generate), [transcription documentation](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), and [speech documentation](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create). The requested provider must implement these formats. Provider-specific NVIDIA/Cloudflare/ComfyUI protocols and OpenRouter image output through chat are not implemented by this adapter.

## APIs and execution

- GET `/api/media/capabilities`: authenticated operation/model manifest, local executable availability, configuration state and limits.
- POST `/api/media/jobs`: validated operation, explicit provider/model, input file IDs, prompt/parameters, UUID requestKey and explicit external-file processing permission.
- GET `/api/media/jobs?offset=0`: owner-only20-item history, actual task states/results, nullable usage and measured duration.
- DELETE `/api/media/jobs/:id`: owner-only terminal history deletion; associated media remains in the library until separately deleted.
- POST `/api/files`: existing authenticated private upload route, now supporting the additional validated formats.
- GET `/api/files?search=...&offset=0`: owner-scoped filename search and100-item pages.
- POST `/api/files/:id/scan`: real ClamAV approval/rejection; no approval on missing executable/signatures, failure or timeout.
- GET `/api/files/:id/download`: session-authenticated, approved, integrity-checked attachment; no public URL.
- DELETE `/api/files/:id`: owner-only private deletion with an audit event.
- POST `/api/agents/tasks/:task_id/cancel`: existing cancellation API used by the studio.

All mutations require the existing CSRF token. The internal media tool is absent from the public agent tool list and cannot be selected by a model/manual plan through the general agent API. Its job/user/task mapping is checked again at execution. Agent events provide task/request/step correlation without storing prompts in logs.

Operations exposed by the shared contract: text, image generation/editing/understanding, video generation/analysis, speech recognition/generation, audio understanding, document analysis/extraction and OCR. Unsupported types are rejected rather than simulated. Local extraction is independent of cloud inference but still requires a reachable authenticated backend.

## Security, quotas and storage lifecycle

The existing quarantine invariant is preserved. Generated provider bytes also enter quarantine before opening/downloading. ClamAV scans verified bytes through stdin, without a shell, with2 concurrent scans and30second timeout, archive/file limits and detection on exceeded limits. The private path is root-contained, symlinks are rejected, and SHA256 is checked at every read. Signature checks are a first layer, not a replacement for scanning or complete media-format validation.

Uploads are limited to15MB; each account has100 files and100MB total across uploads and generated output. Agent admission enforces the existing20 queued/global,3 active/account and50 daily task limit (including agent tasks). Large output can be rejected after a paid provider request if the account consumes remaining storage during execution; output space is not reserved in advance. There is no per-provider monetary budget.

Files are not automatically sent to providers. The selected approved inputs and an explicit permission field are required. The UI resets permission when inputs, operation or model changes. Text-document analysis is limited to40KB; local extraction output to90KB; stored tool results to100KB. Provider bodies are bounded, redirects are rejected and arbitrary provider output URLs are never fetched. URL-only image providers therefore fail clearly instead of creating public/unsafe storage references.

Generation is not automatically retried. A successful result is durably recorded and reused on checkpoint recovery. A failed/interrupted claimed job cannot issue another billed request on resume. Inspect history and explicitly create a new request if necessary; upstream cancellation/refunds are not guaranteed. An output committed before a late cancellation can remain available. Pending queue work survives browser refresh; interrupted running work needs operator/user inspection. No restart success is inferred from persistence alone.

There is manual file/history retention, no automatic expiry. Deleting a source file does not erase text already extracted into task history; delete the task history too. Audit records are retained separately. Back up the database and private volume together. File bytes are not put in PostgreSQL, localStorage, logs or public repositories. Shared/multiple backend instances require shared private storage and maintained scanner availability. HTTPS remains the deployment proxy's responsibility.

## Verification

Executed on Ubuntu26.04.1, Node24.21.0/npm11.19.0 and disposable PostgreSQL16:

- `npm run lint` and `npm run build`, including the existing locale gate.
- `npm run db:migrate` and a repeat application;0050 applied once, then skipped.
- `npx tsx scripts/test-media-engine.ts`: real HTTP/SQL ownership and CSRF; upload/signature/path validation; real ClamAV test signature approval/rejection; download gating; text extraction; invalid UTF-8 failure; actual ffprobe container metadata; idempotency/conflict; output storage and quotas; cancellation; checkpoints; tampering/symlinks; history deletion/audit; bounded/aborted provider failures.
- `npx tsx scripts/test-agent-engine.ts`: affected agent lifecycle/approval/checkpoint/ownership regression.
- `npx tsx scripts/test-chat-stream.ts`, `npx tsx scripts/test-afg-experience.ts`, `npx tsx scripts/test-jarvis-task-storage.ts`: unchanged parser, visual state, locale and local-task regression.
- Shared Preview Chromium: actual upload/scan/local extraction UI, history after refresh, unavailable-provider state, mobile/desktop/tablet, light/dark and Dari RTL. Final screenshots/evidence accompany the delivery report.

No live provider success, physical Android, production migration/deployment, process-kill recovery, microphone capture, successful speech playback or video generation is claimed. The installed emulate v0.0.1 service catalogue has no matching image/audio/video inference emulator. ClamAV QA used synthetic signatures solely to verify invocation and result handling; production signature freshness was not tested. Browser-owned file-picker/audio-control labels follow the browser/OS language. New resources cover English/Dari/Persian/Pashto/Arabic; legacy translation coverage remains outside this milestone.

## Modified source areas

- `database/migrations/0050_multimodal_jobs.sql`
- `src/services/media/{contracts,engine,storage}.ts`
- `src/api/{media,files,http}.ts`
- `src/providers/{providerTypes,openAiCompatible,compatibleMedia}.ts`
- `src/services/providerGateway.ts`, `src/services/agents/{engine,registry}.ts`
- `src/security/upload.ts`
- `src/components/media/{MediaStudio.tsx,mediaCopy.ts,media.css}`
- Existing `src/components/afg/{AfgImageGenView,AfgVideoGenView}.tsx`
- `scripts/test-media-engine.ts`, `.env.example`, this document.

## Recommended next stage

Configure one documented compatible image/audio provider, enable its discovered models and feature flags, attach durable private storage with maintained ClamAV signatures, then perform a live generation/transcription/speech acceptance run. Next integrate durable video polling using a verified provider contract and job checkpoints; add isolated PDF/Office extraction and native Android/device tests. Integrate studio media references into legacy chat/voice only after those paths can preserve the same owner/scanner/consent contract.
