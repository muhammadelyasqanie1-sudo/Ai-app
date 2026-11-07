# Database migrations

Migrations use ordered filenames in the form NNNN_description.sql and are applied once in lexical order.

Set DATABASE_URL and run:

    npm run db:migrate

The runner creates schema_migrations, applies each migration in its own transaction, stores a SHA-256 checksum, and refuses to silently re-run or accept edits to an already-applied migration. Add a new numbered file for every later schema change.

The canonical data-model migration is additive and preserves legacy tables and columns still used by the existing API. It backfills profiles, preferences, providers, models, usage, memory, and audit aliases where possible.

Existing installations initialized with database/schema.sql can run the migration runner afterwards. New installations should use the migration runner as the schema source of truth. The older schema.sql remains a legacy bootstrap/reference file until all environments have migrated.

See BACKUP-RESTORE.md for the documented backup and recovery procedure. Never commit database dumps or secrets.

Locale persistence is introduced by `0003_user_locale_settings.sql`. It creates `user_settings.locale` and backfills it from existing account preferences. Apply it with the normal migration runner before deploying the updated account API.

## Private file library

Migration `0010_private_file_quarantine.sql` adds owner-scoped metadata for private uploads. Apply it with the normal migration runner before using `/api/files`.

Set `AFG_UPLOAD_QUARANTINE_DIR` to an **absolute path on a private persistent disk** (for example, `/var/data/afg-uploads` on a Render disk mounted at `/var/data`). Do not use the repository, `public/`, or `dist/` directories. The directory is created with restrictive permissions by the upload service. The service rejects symlink targets, the filesystem root, and paths inside the application directory; the status endpoint validates the configured directory before enabling uploads.

Uploads are signature-checked and stored under generated filenames, then marked `quarantined`. The current product does not include malware scanning or safe document extraction, so files cannot be downloaded, parsed, or sent to AI yet. Keep chat file attachments disabled until a scanner and approved-file delivery pipeline are implemented.


Migration `0009_staff_rbac_foundation.sql` adds backend-enforced staff roles and their initial permission maps. Apply it with `npm run db:migrate` only after reviewing the backup and deployment plan.


Migration `0011_remove_cloudflare_workers_ai.sql` removes Cloudflare Workers AI from the provider registry and clears its model/fallback selections. Cloudflare R2/KV storage configuration is independent and is not removed by this migration.


## Public API connector fallback groups

Migration `0022_api_connector_fallback_groups.sql` adds optional per-user fallback group and priority fields to API connectors. Connectors in the same group are eligible as sequential alternatives only when they are enabled, verified, owned by the same user, and have the same HTTP method and exact JSON input schema. Apply with `npm run db:migrate` after reviewing `BACKUP-RESTORE.md`. The migration has not been run against any hosted database as part of source changes.


## Persistent API quota queue

Migration `0023_api_connector_quota_queue.sql` adds a durable queue state to owner-scoped API connectors. HTTP 402/429 responses park the affected connector as `waiting` without deleting its endpoint, encrypted credential, priority, or configuration. If the upstream response supplies a valid `Retry-After` or rate-limit reset header, the connector becomes eligible again after that time when the user's API tools are next discovered or called. If the provider supplies no reset time, the connector remains waiting until its owner verifies it again or explicitly re-enables it; AFG AI does not guess monthly renewal dates. Other transient 5xx/network errors continue through the existing retryable fallback path and do not automatically mark the connector quota-exhausted.


## Public API implementation coverage

Migration `0024_public_api_implementation_tracking.sql` adds a durable per-catalog-entry implementation ledger and records whether both upstream catalogue sources were fully synchronized. New entries begin as `catalogued`; later verified documentation/OpenAPI discovery advances them without resetting progress on future catalogue syncs. Statuses distinguish catalogue-only entries, documentation discovery, contract discovery and unsupported protocols. Endpoint verification, credential configuration, successful probes, enabled state and quota waiting remain owner-scoped in the connector records and quota queue. This table contains public integration metadata only; user API credentials remain encrypted in owner-scoped connector records. Apply the migration before using the new tracking dashboard or running another catalog sync.


## Public API discovery work queue

Migration `0025_public_api_discovery_work_queue.sql` adds a durable, bounded admin review queue for each tracked Public API entry. Admins claim up to 25 entries per batch with a 20-minute renewable-by-reclaim lease; expired claims return to the queue and concurrent admins use row locks with `SKIP LOCKED`. Manually recording verified documentation or a discovered contract completes the work item; the automatic official-docs scan keeps the claim active for the next contract-extraction step. Explicitly unsupported protocols are marked blocked; retry returns the item to the queue. This queue does not execute third-party APIs, infer quotas, create credentials, or enable connectors. Apply migration 0025 after 0024 before using the queue controls.


## Public API official documentation evidence

Migration `0026_public_api_docs_evidence.sql` stores bounded evidence extracted from the catalogue entry's official documentation page: same-host OpenAPI/Swagger link candidates, explicit protocol labels, and authentication terms found in the page text. The discovery endpoint only accepts an API already claimed by the current administrator, fetches the catalogue's HTTPS documentation/homepage URL with DNS/SSRF checks, refuses redirects and cross-host links, and caps the response size. These findings are discovery hints, not a verified API contract, endpoint probe, quota confirmation, credential, or permission to enable a connector. Apply migration 0026 after 0025 before using this feature.


## Observed upstream API quota responses

Migration `0027_api_connector_rate_limit_observations.sql` adds owner-scoped storage for rate-limit headers actually returned by an API connector. The executor records a bounded allowlist of upstream response headers (including Retry-After, RateLimit and X-RateLimit limit/remaining/reset fields), the observed HTTP status and timestamp, and a parsed reset instant only when the upstream supplied a valid future value. HTTP 402/429 responses keep the connector in the waiting queue; a known reset makes it eligible after that instant, while a missing reset remains a manual-review state. Connector listing exposes this evidence without exposing credentials. Successful and other non-quota responses may refresh the last observed header snapshot but do not clear a prior quota status. Apply migration 0027 after 0026 before using these fields. No monthly renewal date or remaining quota is inferred.

## API connector quota recovery claims

Migration `0031_api_connector_quota_recovery_claims.sql` adds a short-lived claim timestamp to serialize individual and batch quota recovery probes. The owner-triggered batch action checks at most five connectors whose observed upstream 402/429 reset timestamp has elapsed. Successful probes clear the old quota observation and return the connector to verified/ready while keeping it disabled for explicit owner activation. Unknown reset times are never guessed or probed. Apply with `npm run db:migrate` after reviewing the backup and recovery plan.

## Scheduled API connector health monitoring

Migration `0032_api_connector_health_monitor.sql` adds opt-in monitoring fields and a due-check index. Monitoring can be enabled only for verified, enabled GET connectors; non-idempotent methods are excluded. The scheduler endpoint `POST /api/internal/connector-monitor/run` is protected by the high-entropy `AFG_CONNECTOR_MONITOR_SECRET` bearer secret and checks at most five due connectors per run. Configure a hosting cron/scheduler to call it every 15 minutes. The connector-specific interval is 60–10,080 minutes, defaulting to 360. The migration is additive and must be applied with the normal migration runner after reviewing the backup/recovery plan.

## Retained API credential rotation queue

Migration `0033_api_connector_key_queue.sql` adds queue state, observed quota metadata, and last-use timestamps to saved connector keys. On an actual upstream HTTP 402/429 response, the current key is retained and moved to `waiting`; the next ready key is selected by priority and creation order. If no key is ready, the connector waits rather than deleting credentials or guessing a monthly reset date. When a valid upstream reset time was observed, the waiting key can become eligible at that time; unknown reset times require owner action. A newly selected key is not considered verified by virtue of selection: the connector remains disabled for an explicit health/verification step when the queue had been exhausted. Apply after migration 0032 with `npm run db:migrate`.


## API key renewal lifecycle and usage reporting

Migration `0034_api_key_lifecycle_usage_ledger.sql` adds explicit lifecycle state (`active`, `waiting`, `expired`, `revoked`) plus owner-supplied expiry and renewal dates to the encrypted API key vault. It is separate from migration 0033, which manages quota-waiting key selection. Waiting and expired credentials are retained and cannot be reactivated or deleted; add a newly issued provider key, verify it, then activate it. The authenticated `GET /api/api-hub/usage` endpoint summarizes actual connector runs for the previous 30 days. Provider costs are not estimated. Apply migration 0034 with `npm run db:migrate` after reviewing the backup and recovery plan.


## Hybrid Intelligence Core

Migration `0035_hybrid_intelligence_core.sql` adds owner-scoped private knowledge documents with PostgreSQL full-text indexing and explicitly consented training examples. Existing `user_memories` storage is reused; sensitive memories are excluded from automatic context retrieval. Apply only after backup and explicit migration approval. Training examples are user-owned dataset curation, not automatic model training or fine-tuning.


## Universal Knowledge Engine

Migration `0036_universal_knowledge_engine.sql` adds a curated shared source registry and provenance-aware knowledge documents. It records source type, trust level, license label, language, topic, evidence type, editorial confidence, publication date and a content fingerprint. The authenticated world-knowledge API allows signed-in users to browse/search the corpus; source registration and ingestion are restricted to administrator roles. Relevant content is automatically retrieved into chat as untrusted reference material. Apply migration 0036 only after backup and explicit migration approval. This migration does not start a crawler, bypass website restrictions, or train model weights.


## Continuous world research queue

Migration `0037_world_knowledge_research_queue.sql` adds a topic-agnostic durable research queue with idempotent query hashes, priority, retry attempts, leases, and atomic job claiming. Administrators can enqueue and inspect jobs; authorized workers claim and finish jobs. The queue has no academic-topic allowlist. A separate scheduled worker and approved search-provider integration are required to execute research and ingest source-backed documents. Apply migration 0037 only after backup and explicit migration approval.


## Programming-only knowledge discovery engine

Migration `0038_programming_knowledge_domain.sql` adds an extensible programming topic catalog covering languages, frontend, backend/API engineering, databases, mobile, AI/ML, DevOps/cloud, defensive security, testing, architecture, developer tooling, open source, data engineering, games, embedded/IoT and technical documentation. It associates recurring search jobs with their topic. The catalog is data-driven; add topics and search phrases without adding a subject allowlist to chat.

The bounded worker is `scripts/programming-knowledge-worker.ts`, invoked with `npm run knowledge:worker`. It requires `DATABASE_URL` and `TAVILY_API_KEY`, seeds idempotent research jobs from enabled topics, claims a bounded number of jobs, searches Tavily, and stores short result excerpts with source URL, query provenance, low initial confidence and an explicit unverified evidence label. It does not fetch arbitrary result pages, download code, execute source material, bypass paywalls, or claim to train model weights. Search excerpts are discovery leads, not full verified documentation. Failed jobs receive bounded retries; each run is capped by `AFG_KNOWLEDGE_MAX_JOBS` (1–20, default 8).

Apply migration 0038 only after a database backup and explicit migration approval. Configure the search API key as a server-side secret in the hosting environment; never commit it. A hosting cron/scheduler must be configured separately to invoke the worker periodically. Source changes do not create or activate a schedule, run migrations, execute the worker, or deploy the service.


## Deep programming repository research worker

The worker command `npm run knowledge:worker` now inspects public GitHub repository results discovered by Tavily. It indexes a repository README and up to three small documentation-oriented files, records the source URL and declared SPDX license when available, preserves Markdown/code formatting, and labels repository material as community reference. It is deliberately bounded to two repositories per job and twelve repository documents per worker run. It does not clone or execute code, access private repositories, or mirror GitHub. Optional `GITHUB_TOKEN` is a server-side secret for API rate-limit headroom; without it the worker uses the unauthenticated public API quota.


## Programming repository and release tracking

Migration `0039_programming_release_tracking.sql` adds structured metadata for discovered public GitHub repositories and a normalized release-history table. The bounded knowledge worker records repository metadata, the declared SPDX license, last push time and up to three latest published releases, including release-note text and canonical GitHub URLs. Release notes with sufficient content are indexed in the knowledge corpus with publication dates. It does not clone or execute repositories. Apply migration 0039 after 0038 and only after backup/recovery review. The worker's recurring seed-query refresh interval is seven days.


## Multilingual programming research discovery

Migration `0040_multilingual_programming_discovery.sql` adds language-specific search phrases to each programming topic for Dari, Persian and Pashto. The research worker creates separate idempotent jobs per language and stores search excerpts with the corresponding language label. GitHub repository documentation retains its own English label where appropriate. Apply after migration 0039; no model translation or weights training is performed.


## Public programming source-code index

Migration `0041_programming_source_code_index.sql` adds a bounded, repository-linked index of public source files, approximate extracted symbol names, and selected dependency manifests. The worker applies extension, path, file-size and per-run byte limits; it does not clone repositories or execute/install indexed code. Symbol extraction is heuristic and must not be treated as a complete syntax tree; line positions are approximate. The worker excludes common credential/key/secret path names and redacts several common private-key/token patterns, but this is not a guarantee that all secrets are detected. Dependency metadata reflects manifest declarations, not resolved or security-audited dependency graphs. Apply after migration 0040 and backup/recovery review. The authenticated `GET /api/intelligence/world/code` endpoint searches indexed paths, source text and extracted symbol names. A generated PostgreSQL search vector and GIN index support ranked code retrieval, and chat context can retrieve matching source-file excerpts alongside ordinary knowledge documents.

## Remote browser automation profiles

Migration `0042_browser_automation_profiles.sql` adds a per-user mapping to an isolated Browserbase persistent Context and records only the active remote session ID and limited recent page metadata. Browser cookies and signed-in website state remain in the remote Context; credentials are never copied into AFG AI's PostgreSQL records. The authenticated browser automation API and chat tools require the private server environment variable `BROWSERBASE_API_KEY` in addition to this migration. Browserbase infers the project from the API key; `BROWSERBASE_PROJECT_ID` is not required. Apply migration 0042 only after database backup and recovery-plan review. See `docs/BROWSER_AUTOMATION.md` for the activation checklist, Gmail live-view sign-in procedure, and security boundaries. A migration and source commit do not activate or deploy a Browserbase session.


## Expanded programming research curriculum

Migration `0043_expanded_programming_research_curriculum.sql` adds deeper discovery topics for computer-science fundamentals, systems and functional programming, networking, distributed systems, cloud-native engineering, observability/SRE, performance, advanced testing, accessibility, design systems, desktop development, browser automation, AI coding agents, compiler/AST/LSP tooling, API interoperability, applied cryptography, robotics, blockchain engineering and technical communication. It seeds focused English searches plus Dari/Persian/Pashto searches for selected core areas. The `coding-agents` topic has highest priority and targets repository-aware agents, tool loops, planning, multi-file editing, context engineering, sandboxing, approval gates and evaluation benchmarks.

Apply 0043 only after migrations 0035–0042, a database backup, and explicit migration approval. The migration only adds research topics; it does not run the worker or start a scheduler. The worker still needs a scheduled invocation with server-side `DATABASE_URL` and `TAVILY_API_KEY`. Browserbase is interactive browser control and is not currently the background research provider; background discovery uses Tavily and the public GitHub API. No worker run, migration, test, build or deployment is performed by adding this migration.

## Backend-only row-level security for intelligence data

Migration `0044_intelligence_backend_only_rls.sql` enables PostgreSQL row-level security on private knowledge, opt-in training examples, shared research sources/documents/jobs/topics, repository/release/source-code indexes and browser profiles. These tables are accessed through AFG AI's authenticated backend using its private database connection; no anonymous or client-side Data API policies are added. The server remains responsible for user ownership checks. Apply after 0043.

## Deeper research ingestion

The programming worker now asks Tavily for extracted Markdown page content, not just snippets. It labels extracted pages as unverified reference material, applies a conservative domain-based source classification (official documentation, academic, community, or unreviewed), stores provenance and caps each page. Short snippets remain explicitly unverified. The worker is bounded to three public GitHub repositories per run and a small number of documentation/source files to avoid exhausting unauthenticated GitHub API limits. GitHub source code is reference data only: it is never executed, installed or treated as instructions. A GitHub token is optional but improves API headroom.

The Railway deployment uses the existing Ai-app service to avoid provisioning a second always-on resource. Set `AFG_KNOWLEDGE_WORKER_ENABLED=true`; the API process then launches the worker as a child process after startup and every `AFG_KNOWLEDGE_WORKER_INTERVAL_MINUTES` (default 60, minimum 30). The child uses the existing server-side `DATABASE_URL` and `TAVILY_API_KEY`; no key is exposed to the browser. A PostgreSQL advisory lock prevents overlapping runs across replicas. The service continues serving chat normally; do not replace its start command with the worker. The initial delay defaults to 90 seconds. The bounded worker processes up to eight jobs and three public GitHub repositories per run, then revisits completed topics after seven days.

GitHub source text (README, release notes, documentation and source files) is now indexed only when GitHub declares an explicitly permissive license (MIT/MIT-0, Apache-2.0, BSD-2-Clause/3-Clause, ISC, 0BSD or Unlicense). For unknown, proprietary or copyleft licenses, the worker retains repository metadata and license information but does not copy repository text or source code into the knowledge corpus. Tavily GitHub-page extracts are excluded; GitHub repository content is indexed through the license-aware API path only.

## Targeted GitHub repository discovery

Migration `0045_github_repository_discovery_queries.sql` adds explicit `site:github.com` searches for permissively licensed AI coding agents, browser automation tools, compiler/AST/LSP tooling, distributed systems and open-source reference implementations. This improves actual repository/code discovery instead of relying only on Tavily's general web ranking. The worker still stores GitHub text only when the repository declares an allowlisted permissive license.

The source classifier now recognizes a broader set of official developer documentation domains (including Google Cloud, AWS, Microsoft, Python, Rust, Go, React, Flutter, FastAPI, Django, PyTorch, TensorFlow and others), academic sources, established engineering publications, and community discussions. Source trust is a ranking hint, not proof that every statement is correct.

## Coding-agent research priority

Migration `0046_prioritize_coding_agent_research.sql` sets `coding-agents` to the maximum priority 10 and lowers generic AI/ML plus open-source, browser automation, compiler tooling, advanced testing and architecture topics to priority 9. This makes repository-aware coding-agent research the first scheduled learning track while preserving the rest of the programming curriculum.

## Synchronize queued research priorities

Migration `0047_sync_research_job_priorities.sql` updates queued and retryable failed research jobs to match their current topic priority after curriculum changes. This ensures newly prioritized coding-agent topics are processed ahead of lower-priority AI/ML and general topics without disturbing already completed or currently leased jobs.

The worker also uses GitHub's repository Search API directly for MIT- and Apache-2.0-licensed AI coding agents, plus MIT-licensed Playwright/browser-automation and Tree-sitter/LSP tooling. It checks repository freshness before re-indexing and remains capped at three repositories and a bounded number of files per run. This supplements Tavily discovery so code examples can be found even when general web ranking does not return GitHub repository URLs.

The code-file index prioritizes actual programming-language source files from `src`, `lib`, `app`, `packages`, `cmd`, `internal`, `crates`, `server` and `client` directories. It excludes Markdown, GitHub workflow metadata and documentation paths from the code-file index (documentation remains in the separate knowledge-document corpus), and only includes dependency manifests as non-source files. This prevents the limited per-repository file budget from being consumed by `.github` YAML and README/CONTRIBUTING files before actual source code.

The repository indexer stores an internal index-policy version in repository metadata. When source-selection or extraction policy changes, a version mismatch triggers a one-time reindex even if the repository was checked within the normal seven-day refresh window. This keeps the source-code index consistent with the current source-first filtering rules.

When a repository is reindexed, code-index rows that no longer match the current source-selection policy are removed before the new bounded file set is written. HTML and CSS/SCSS/Sass/Less are included as source languages alongside application code. This prevents stale Markdown or workflow metadata from continuing to appear in code retrieval after the source-first index policy changes.
