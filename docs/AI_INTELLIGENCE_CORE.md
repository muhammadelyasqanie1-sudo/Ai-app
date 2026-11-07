# AFG AI Hybrid Intelligence Core

## What is implemented in source

AFG AI uses the existing server-side provider gateway as its model execution layer. The hybrid core adds three distinct, deliberately separated data paths:

1. **Personal memory** — reuses the existing owner-scoped `user_memories` records and the existing memory-enabled preference. Only non-sensitive memories are automatically retrieved into the personal gateway context.
2. **Private knowledge retrieval (RAG)** — stores user-owned text documents in PostgreSQL and retrieves up to four relevant documents using PostgreSQL full-text search. Retrieved text is bounded and explicitly marked as untrusted reference material.
3. **Training-data curation** — stores prompt/ideal-answer examples only when the user explicitly consents per example. Users can list, delete and export their own examples as JSONL.

## API

All routes require an authenticated session. State-changing routes require the existing CSRF token. Every database query is scoped to the authenticated user.

- `GET/POST /api/intelligence/knowledge`
- `DELETE /api/intelligence/knowledge/:id`
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
