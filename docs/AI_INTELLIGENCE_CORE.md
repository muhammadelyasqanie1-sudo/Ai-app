# AFG AI Hybrid Intelligence Core

## What is implemented in source

AFG AI uses the existing server-side provider gateway as its model execution layer. The hybrid core adds three distinct, deliberately separated data paths:

1. **Personal memory** — reuses the existing owner-scoped `user_memories` records and the existing memory-enabled preference. Only non-sensitive memories are automatically retrieved into the personal gateway context.
2. **Private knowledge retrieval (RAG)** — stores user-owned text documents in PostgreSQL, chunks them, and retrieves relevant material using PostgreSQL full-text search with an optional embeddings rerank. Deep research can add cited public sources. Retrieved text is bounded and explicitly marked as untrusted reference material.
3. **Training-data curation** — stores prompt/ideal-answer examples only when the user explicitly consents per example. Users can list, delete and export their own examples as JSONL.

## API

All routes require an authenticated session. State-changing routes require the existing CSRF token. Every database query is scoped to the authenticated user.

- `GET/POST /api/knowledge`, `GET/PATCH/DELETE /api/knowledge/:id`
- `GET /api/knowledge/status`, `GET /api/knowledge/search`, `GET /api/knowledge/stale`
- `POST /api/knowledge/research`, `POST /api/knowledge/:id/refresh`, `POST /api/knowledge/ingest`
- Legacy: `GET/POST /api/intelligence/knowledge`, `DELETE /api/intelligence/knowledge/:id`
- `GET/POST /api/intelligence/training/examples`
- `DELETE /api/intelligence/training/examples/:id`
- `GET /api/intelligence/training/export`

The personal gateway retrieves memory and relevant knowledge before sending the conversation to `prepareVerifiedChat`. Provider credentials and inference remain behind the existing provider gateway.

## Important distinction: data curation is not model-weight training

This milestone does not run GPU training or fine-tune model weights. It creates a safe, user-owned dataset that can later be reviewed, filtered, licensed and used with a compatible fine-tuning provider or a self-hosted open model. It does not automatically add user conversations to training data.

## Database rollout

Apply additive migration `0035_hybrid_intelligence_core.sql` using the repository migration runner only after taking a database backup and receiving explicit deployment/migration approval. The application returns a clear 503 for these routes until the migration is applied.

## Current limitations

- PostgreSQL full-text search uses the `simple` configuration; retrieval quality for Dari, Persian and Pashto needs evaluation and may require multilingual tokenization or embeddings later.
- No embeddings provider is configured or invoked; this implementation does not pretend vector search exists.
- Knowledge ingestion is plain text only. PDF/image extraction and file attachments remain disabled until their secure pipeline is complete.
- There is no training job runner, GPU worker, model registry for fine-tuned artifacts, evaluation suite or automatic model promotion.
- A localized Knowledge and Training workspace is available under Settings → Your Assistant → AFG AI Intelligence. It supports plain-text knowledge management, explicit-consent training examples, deletion and JSONL export.

## Professional coding and digital-design quality layer

The chat API and authenticated personal gateway now prepend a professional capability standard based on the latest user request. Coding requests receive senior-engineering workflow guidance (inspect before edit, preserve project conventions, secure implementation, edge cases, evidence-based debugging and honest execution reporting). Design and motion requests receive product-design guidance (visual hierarchy, design systems, responsive behavior, accessibility, motion timing/easing, performance and reduced-motion support).

This is a prompt-level quality layer. It does **not** by itself add a code execution sandbox, browser automation, Figma integration, video renderer, GPU worker, or new model weights. Actual outcomes still depend on the selected verified model and the integrations/tools that are genuinely connected and authorized. No claim is made that this layer outperforms Claude or every leading model; that requires repeatable benchmark results.

## GitHub repository analysis and code review tools

When a signed-in user has a verified GitHub connection and asks AFG AI to inspect, review, debug, or change a repository, the chat API can expose the user-scoped GitHub tools. Repository-related wording in English and Dari can trigger this workflow without requiring the user to say "GitHub" explicitly.

- `github_get_repository_tree` resolves the selected ref and returns a bounded list of tracked paths and file sizes (default 80, maximum 120 entries per call); an optional `path_prefix` lets the assistant inspect a focused subtree. It does not download every file; the assistant should select relevant paths and then use `github_get_file`.
- `github_compare_branches` compares two refs and returns commit summaries, ahead/behind counts, file-change statistics, and bounded/redacted patch excerpts for up to eight changed files.
- Existing `github_search_code` and `github_get_file` support targeted code discovery and inspection.
- `github_commit_files` creates up to twelve text-file blobs, a new Git tree and a single commit, then advances the existing working branch without force-pushing. This keeps related source changes together and avoids a sequence of independent file commits; the combined text payload is capped at 100 KB.
- Existing write operations remain branch-scoped: the assistant must create/use a non-default working branch before committing file changes. Pull requests are created only when the user explicitly asks.

These tools improve repository understanding and review, but they are not a code execution sandbox. The hosted terminal remains read-only; running builds, tests, application code, or deployments is not enabled by this milestone.


## Universal Knowledge Engine — first implementation milestone

Migration `0036_universal_knowledge_engine.sql` adds a shared source registry and a provenance-aware knowledge document store. Source records include domain, source type, trust level and license label. Documents retain language, topic, evidence classification, editorial confidence, publication date and a SHA-256 content fingerprint for deduplication.

The authenticated API exposes:
- `GET /api/intelligence/world/status` — engine and corpus counts.
- `GET /api/intelligence/world/sources` and `GET /api/intelligence/world/documents` — browse curated source metadata and document metadata.
- `GET /api/intelligence/world/search?q=...` — search the shared corpus.
- `POST /api/intelligence/world/sources` and `POST /api/intelligence/world/documents` — administrator-only source registration and content ingestion.

Relevant shared documents are retrieved into chat context automatically. Source text is explicitly untrusted and cannot override system or user instructions. Search results preserve source URLs and distinguish evidence types and trust levels. Community material can be stored, but is labelled separately from official and academic material.

**This is a curated RAG knowledge layer, not autonomous web crawling or model-weight training.** The ingestion API accepts content already obtained through a permitted research workflow; it does not fetch arbitrary URLs, bypass paywalls, scrape sites, or execute downloaded content. Search currently uses PostgreSQL `simple` full-text search; Dari/Persian/Pashto language-aware tokenization, embeddings/vector search, scheduled crawlers, freshness policies, review queues and corpus-scale evaluation remain future milestones. Respect source terms, robots policies, licenses, privacy and rate limits before ingestion.


## Continuous, topic-agnostic research queue — milestone 2

The Universal Knowledge Principle is now explicit in the chat policy: no lawful academic or knowledge domain is excluded merely because it is sensitive. Knowledge and operational assistance are evaluated separately. The assistant should explain facts, history, theories, controversy, and defensive knowledge candidly, while refusing only actionable help that facilitates serious harm, crime, exploitation, or abuse and redirecting to safe alternatives.

Migration `0037_world_knowledge_research_queue.sql` adds a durable research queue. Administrators can enqueue any topic, list jobs, claim work with a ten-minute lease using PostgreSQL row locking, and finish jobs. Expired leases can be reclaimed; failed work is rescheduled with bounded backoff. Duplicate topic/language requests are coalesced. The queue does not impose a subject allowlist.

Endpoints:
- `POST /api/intelligence/world/jobs` — enqueue a topic-agnostic research query.
- `GET /api/intelligence/world/jobs` — inspect queue state.
- `POST /api/intelligence/world/jobs/claim` — atomically claim one ready job.
- `POST /api/intelligence/world/jobs/:id/finish` — finish or fail a claimed job.

This milestone creates the durable queue and worker contract, not a running crawler. A scheduled worker/search-provider integration still needs to claim jobs, search approved sources, evaluate evidence, and submit accepted documents to the ingestion endpoint. No arbitrary URL fetching, paywall bypass, private-data collection, or model-weight training is enabled by this migration.


## Programming Knowledge Discovery Engine — milestone 3

Migration `0038_programming_knowledge_domain.sql` adds a data-driven topic catalog for programming and its subfields: languages and compilers; frontend; backend and APIs; databases; mobile; AI/ML and LLM engineering; DevOps/cloud; defensive application security; testing; software architecture; developer tools; open source; data engineering; game development; embedded/IoT; and technical documentation. The topic catalog scopes shared knowledge acquisition only; it does not restrict normal assistant conversations.

The scheduled worker source is `scripts/programming-knowledge-worker.ts` and the command is `npm run knowledge:worker`. It uses the already-supported Tavily search provider through the server-side `TAVILY_API_KEY` secret and `DATABASE_URL`. Each run seeds idempotent topic queries, claims up to 20 jobs (default 8), stores bounded search excerpts, records source URLs and query provenance, and labels search snippets as unverified with deliberately low initial confidence. It retries transient failures with bounded backoff. No arbitrary webpage fetch or code execution is performed.

**Important current boundary:** this first worker indexes search-result excerpts, not complete documentation sites or repositories. Search snippets are discovery evidence, not verified facts. It does not yet crawl official documentation, parse Git repositories, perform semantic embeddings/vector search, rank conflicting versions, or train model weights. A host scheduler must invoke the worker; merely adding this source does not start it. The worker requires `DATABASE_URL`, `TAVILY_API_KEY`, migration 0038, and an explicitly configured cron/scheduler. Do not run migration, worker, tests, build, or deployment without approval. Use source licenses and site terms when a later full-content ingestion stage is added.


## Deep public repository documentation indexing — milestone 4

The programming research worker now recognizes public GitHub repository results and performs bounded repository inspection through the GitHub REST API. For each research job it inspects at most two public repositories; per repository it stores the README and up to three small, documentation-oriented Markdown/RST/TXT files from the root, `docs/`, or selected project metadata paths. It records repository/file URLs, the research query, declared SPDX license when GitHub exposes one, and community/unverified provenance. Markdown formatting is preserved for code examples and headings.

The worker enforces response byte limits, request timeouts, no redirects, a bounded number of jobs/results/repositories/files, and only contacts the fixed Tavily and GitHub API hosts. It does not clone repositories, execute source code, index arbitrary binary assets, or bypass private repository permissions. A `GITHUB_TOKEN` may be configured as an optional server-side secret to increase GitHub API rate limits; only public repositories are indexed. If no license is declared, the source license remains unknown and the material must not be treated as freely reusable.

This milestone is a bounded documentation/repository discovery layer, not a complete mirror of GitHub. Large repositories, source-code files, release histories, issues, pull requests, dependency graphs, and full-text semantic indexing remain future work. Search-result excerpts remain explicitly unverified; repository documentation is reference material with community provenance, not automatically authoritative or security-reviewed.


## Repository release intelligence and freshness-aware retrieval — milestones 5–6

Migration `0039_programming_release_tracking.sql` adds structured public repository metadata and release history. The worker now records public repository identity, default branch, declared SPDX license, stars/forks, last push time, and up to three latest published GitHub releases per discovered repository. Release notes are stored with their original GitHub release URL and publication date, and indexed as reference documents when the release body contains useful notes. Release checks are bounded and share the worker's existing request, response-size and per-run limits. Research topic seed queries are eligible for refresh after seven days rather than thirty, allowing recurring discovery to notice newer documentation and releases.

Knowledge retrieval now uses PostgreSQL `websearch_to_tsquery('simple', ...)` and cover-density ranking instead of strict `plainto_tsquery` matching. This supports quoted phrases and explicit OR/negation syntax and ranks matching documents by relevance, source trust, and publication freshness. It remains PostgreSQL full-text retrieval, not embeddings or a vector database; language-specific morphology and high-quality Dari/Pashto tokenization are still future work.

Authenticated read endpoints expose the tracked corpus:
- `GET /api/intelligence/world/repositories?q=&limit=`
- `GET /api/intelligence/world/repositories/:id/releases`
- `GET /api/intelligence/world/status` now includes repository and release counts.

All repository/release data is public-source reference material. Stars and push dates are metadata, not quality guarantees; prereleases are labeled, licenses are recorded as declared by GitHub, and no code is executed. The worker still needs migrations 0035–0039, server-side `TAVILY_API_KEY`, and a scheduler to run periodically. Optional `GITHUB_TOKEN` improves API quota headroom. No migration, worker run, build, test, or deployment has been performed in this milestone.


## Multilingual programming discovery — milestone 7

Migration `0040_multilingual_programming_discovery.sql` adds language-specific search phrases to the programming topic catalog for Dari, Persian and Pashto. The worker now queues those queries separately with language-aware idempotency keys and records the language of each search-result excerpt. English remains the language label for English GitHub README/release documentation; the language of a search query is not incorrectly used to relabel source documents. This improves discovery coverage but does not translate sources, guarantee search-provider recall, or provide full Dari/Pashto stemming. Apply migration 0040 after 0039.


## Public source-code and dependency intelligence — milestone 9

Migration `0041_programming_source_code_index.sql` adds a bounded per-repository source-file index. The public GitHub tree is filtered to a conservative extension allowlist; generated/vendor/build directories, binaries, and oversized files are skipped. The worker indexes at most 16 candidate files per repository, 36 KB per file, and 240 KB of source text per worker run. It extracts approximate symbol names for supported languages and records selected dependency manifests (package.json, requirements.txt, pyproject.toml, Cargo.toml, go.mod, pom.xml). Extraction is heuristic, not a compiler or complete AST, and dependency versions are recorded as declared rather than resolved.

Authenticated search is available at `GET /api/intelligence/world/code?q=&language=&limit=`. Chat retrieval now searches both the shared document corpus and indexed code files using PostgreSQL full-text ranking, and injects source-linked excerpts and symbol/dependency metadata as untrusted references. Status includes source-code file and extracted-symbol counts. Each record retains repository, path, GitHub URL, blob SHA, declared license and content fingerprint. Public code remains subject to its repository's declared license; unknown licenses remain unknown. Source files and manifests are never executed, installed, or evaluated. Apply migration 0041 after backup/review before enabling the worker. No migration, test, build, worker run, or deployment is performed by these source edits.

## Remote browser automation — milestone 10

AFG AI now has source-level integration for a real remote Chromium browser powered by Playwright and Browserbase. The authenticated chat tool catalog can open public websites, take fresh snapshots of visible controls, click by snapshot reference, fill non-password fields, press a limited set of keys, scroll, wait for updates, and release the remote session. Browser interactions can run through up to six tool rounds per request. A per-user persistent Browserbase Context retains website session state; the PostgreSQL profile table stores only the Context/session identifiers and limited recent page metadata.

For Gmail, AFG AI opens the real Gmail sign-in page and returns a Browserbase live-view URL. The account owner manually enters their password/passkey and MFA challenge directly into that remote browser; passwords and one-time codes are not accepted by the chat typing tool. CAPTCHA solving, session recording and session logging are explicitly disabled for new browser sessions. Page content remains untrusted input, and consequential actions require explicit approval.

This is UI automation, not yet a Gmail API OAuth connection. Deployment activation requires the private server variables `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`, migration `0042_browser_automation_profiles.sql`, dependency installation and deployment of the working branch. None of those external activation steps is performed by a GitHub source commit. See `docs/BROWSER_AUTOMATION.md` for setup and limitations.

## Expanded programming research curriculum — milestone 4

Migration `0043_expanded_programming_research_curriculum.sql` expands the scheduled research catalog beyond the initial 16 domains. New discovery areas include computer-science fundamentals, systems and functional programming, networking and protocols, distributed systems, cloud-native engineering, observability/SRE, performance, advanced quality engineering, accessibility, design systems, desktop apps, browser automation, AI coding agents and harness engineering, compiler tooling/AST/LSP, API interoperability, applied cryptography, robotics, blockchain engineering, and technical communication.

The highest-priority new topic is `coding-agents`. It seeds focused research queries for repository-aware coding agents, planning/tool loops, context engineering, multi-file editing, human approvals, sandboxing, Git checkpoints, and benchmark-based evaluation. Core queries are also seeded in Dari, Persian, and Pashto; the existing curriculum continues to seed multilingual searches for its original domains.

The worker remains a bounded scheduled process, not a continuously running crawler. Each invocation seeds the enabled catalog and processes at most `AFG_KNOWLEDGE_MAX_JOBS` jobs (default 8, hard maximum 20). Tavily discovers sources; the GitHub API indexes selected public repositories, README/release/documentation material and a small bounded sample of source files. Search excerpts are explicitly marked unverified. Public repository source indexing is bounded and secret-redacted; repository license metadata is retained, but a declared license must still be reviewed before reusing code in AFG AI.

**Activation:** migrations 0035–0044 are applied to the active AFG AI Supabase database. The API server includes an opt-in scheduler; set `AFG_KNOWLEDGE_WORKER_ENABLED=true` and keep `DATABASE_URL` plus `TAVILY_API_KEY` as private Railway variables. The scheduler starts the bounded worker after a short startup delay and repeats every 60 minutes by default. A PostgreSQL advisory lock prevents overlapping runs across replicas. The feature branch still needs to be deployed to the Ai-app service before chat retrieval and automatic ingestion are live. Browserbase browser control is a separate interactive browser capability; background discovery uses Tavily and GitHub's public API, not Browserbase.

## Self-learning knowledge engine — milestone 11

Migration `0051_self_learning_knowledge_engine.sql` extends the owner-scoped knowledge store with chunked retrieval, categories, source provenance, trust and verification labels, summaries, tags, language, content fingerprints, freshness timestamps and optional embeddings. It adds `knowledge_chunks`, `knowledge_research_runs` and `knowledge_research_sources`, with row-level security enabled on the new tables. The migration is additive and does not edit earlier migrations.

**What is implemented in source**

- `src/services/knowledgeEngine.ts` performs deterministic cleanup, classification, chunking, extractive summaries, key-point extraction, lexical overlap, source/trust classification, language detection, content hashing and refresh scheduling. It never calls a model to invent facts.
- `src/services/knowledgeBase.ts` provides owner-scoped save, dedupe, quota enforcement, chunk indexing, search, chat/agent context, detail inspection, user correction, deletion, stale-source discovery and refresh. Retrieval uses PostgreSQL FTS and also builds a forgiving OR/prefix query so natural-language questions do not fail when one word differs (for example `postgres` versus `postgresql`).
- `src/services/deepResearch.ts` runs bounded multi-source research through the existing verified Tavily/Brave/SerpAPI connection, deduplicates sources, optionally reads limited pages through a fresh isolated Browserbase session, compares sources lexically, preserves exact citation URLs, labels unread sources honestly, and saves only when requested. Reports are extractive and explicitly state that `multi_source` is lexical corroboration, not independent fact-checking.
- `src/security/publicUrl.ts` centralizes SSRF/public-URL validation and is shared by browser research and source refresh. Internal, loopback, reserved and credential-bearing URLs are blocked, including DNS results.
- `src/api/knowledge.ts` exposes authenticated, CSRF-protected, owner-scoped routes. `src/api/chatHandler.ts` adds automatic private-knowledge context and an explicit `afg_knowledge_search` tool. `src/services/agents/registry.ts` exposes `knowledge_search` to coding/research agents, and `src/services/agents/engine.ts` supplies planner context.
- `src/components/afg/AfgKnowledgeEnginePanel.tsx` lets the owner add text, run cited deep research, search/filter, inspect chunks and provenance, correct, refresh and delete knowledge. The legacy duplicate private-knowledge editor was replaced by this panel.
- `scripts/knowledge-refresh-worker.ts` (`npm run knowledge:refresh`) refreshes a bounded number of stale public sources. A host scheduler must invoke it. User-corrected documents are never overwritten; the worker records that the upstream source changed and preserves the owner's text.

**Security and honesty invariants**

- Web and file text is untrusted data. Retrieved references carry an explicit security notice and are never treated as system instructions.
- Private files are accepted only through the explicit `authorized: true` ingest route, and binary/PDF bytes are rejected until a trusted extraction and scanning pipeline exists. Text-file ingestion is supported.
- No model weights are trained, and no fake learning progress or fake embeddings are produced. `vectorSearch` is reported true only when an embedding provider is fully configured.
- Sources are cited by their exact URLs. Unread or failed sources are listed as not read. Conflicts are surfaced as source disagreement, not silently resolved.

**Optional environment variables**

- `AFG_KNOWLEDGE_EMBEDDING_BASE_URL`, `AFG_KNOWLEDGE_EMBEDDING_API_KEY`, `AFG_KNOWLEDGE_EMBEDDING_MODEL` — all three are required to enable OpenAI-compatible embedding reranking. Leave them empty for pure PostgreSQL FTS.
- `AFG_KNOWLEDGE_REFRESH_MAX` — maximum stale documents per refresh-worker run (default 5, hard maximum 20).
- `TAVILY_API_KEY` (or an enabled/verified Web Search connection) and optional `BROWSERBASE_API_KEY` are reused from the existing integrations. Gemini is not required or defaulted.

**Verification performed for this milestone**

- TypeScript check (`npm run lint`) passes.
- Production build (`npm run build`) passes.
- Offline deterministic tests (`npx tsx scripts/test-knowledge-engine.ts`) pass.
- The full migration chain, including 0051, was applied to a temporary local PostgreSQL 18 instance; schema, FTS, generated vectors, dedupe, constraints, provenance and cascade behavior passed.
- Service integration checks against that database passed: save/chunk/classify, dedupe, detail, FTS and agent tool, filters, owner-scoped chat context, status, correction, cross-user isolation, stale discovery, graceful failed research when search is unconfigured, and deletion.
- Not tested here: a live Tavily/Brave/SerpAPI call, a live Browserbase read, production database migration, and a production deployment. No production deployment or merge to `main` was performed.

**Current limitations**

- Embeddings are optional and provider-dependent; no bundled embedding model or vector database is added.
- PDF/image extraction and arbitrary binary file ingestion remain disabled.
- Browser reading is limited to deep research and a small number of pages; it uses fresh isolated sessions and does not access user browser profiles.
- Natural-language quality for Dari/Persian/Pashto still depends on PostgreSQL tokenization and should be evaluated; the code does not claim semantic parity with embeddings.
- Source comparison is lexical and heuristic. It is not fact-checking, peer review or a guarantee of correctness.
