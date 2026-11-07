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
- No dedicated UI screens have been added in this backend milestone; the APIs are ready for a localized Knowledge and Training workspace.
