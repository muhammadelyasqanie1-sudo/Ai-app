# AFG AI — Agent Runtime, Model Routing and File Jobs

This note documents the implementation added alongside the existing provider gateway and agent/media execution queue.

## Model routing

- Uses the existing provider registry and live health checks; no duplicate provider adapters or client-side secrets.
- Filters by actual advertised capability and recent health verification.
- Supports exact provider-qualified model IDs, administrator-configured fallback order, optional provider preference and cost ceilings.
- Auto chat can prefer the server-local Ollama provider with `AFG_AI_PREFER_OFFLINE=true`. This is best-effort preference, not a strict offline guarantee.
- Manually selected models remain pinned; fallback is limited to the existing Auto/fallback policy.

## Durable agent runtime

- Reuses `agent_tasks`, `agent_steps`, and `agent_events` from migration 0049.
- Migration 0052 adds progress, checkpoint, heartbeat and JSON event payload columns.
- Worker heartbeat is persisted every 10 seconds. A task with no heartbeat for 90 seconds is marked failed/interrupted.
- Potentially billed or side-effecting work is not automatically replayed after an interruption. The user must inspect and explicitly resume the task.
- Owner-scoped event stream: `GET /api/agents/tasks/:taskId/events`; supports `Last-Event-ID`.

## File and media lifecycle

- Uploads remain private and quarantined under `AFG_UPLOAD_QUARANTINE_DIR`.
- File use requires a successful configured malware scan. AI ingestion does not bypass quarantine.
- Media jobs reuse the durable agent queue and `media_jobs` table from migration 0050.
- Owner-scoped event stream: `GET /api/media/jobs/:jobId/events`; it reports DB-backed execution state, task progress, result and terminal status.
- External processing of uploaded content still requires explicit `allowExternalProcessing` consent in the existing media request contract.

## Database rollout

Run `npm run db:migrate` only after backing up the PostgreSQL database. Migration 0052 is additive and follows 0051. Do not edit previously applied migrations.

## Configuration

- `AFG_AI_PREFER_OFFLINE=false` — set true to prefer a healthy Ollama model for Auto chat.
- `AFG_AI_PROVIDER_ORDER` — optional comma-separated preference order for equivalent verified models.
- `OLLAMA_BASE_URL` — must resolve to a loopback endpoint on the AFG AI server for the existing Ollama adapter.

No new npm dependency is required.
