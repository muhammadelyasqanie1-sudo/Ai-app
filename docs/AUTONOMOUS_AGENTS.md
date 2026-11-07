<!-- coderabbit-ai-generated:v1 -->

# Autonomous agent execution foundation

## Scope and architecture

This extends the existing application and provider gateway. New agent task/step/event records represent execution checkpoints, not a second conversation, memory or provider service. The Automation navigation item now opens the authenticated execution workspace. Existing chat, local tasks, native plugins and offline runtimes remain available.

- `src/services/agents/registry.ts`: strict Zod tool inputs, specialist permissions, model-backed planning/drafting, and adapters to existing search, browser, GitHub, knowledge and memory services.
- `engine.ts`: sequential supervisor, queue, PostgreSQL advisory execution locks, transactional checkpoints, cancellation, deadlines, explicit retry and terminal cleanup.
- `src/api/agents.ts`: authenticated owner-scoped API, CSRF, idempotency, queue/storage limits, immutable plans and audited step approvals.
- `AgentWorkspace.tsx`, `agentCopy.ts`, `agents.css`: responsive task list, plan inspection, step inputs/results, explicit approval, retry/cancel and event history. New interface copy supports English, Dari/Persian, Pashto and Arabic.
- `JarvisShell.tsx`: polls actual server task state and drives the existing core while a task runs. Account changes remount the workspace to clear prior account state.

The supervisor validates specialist assignments. Research can search/read public pages; coding can inspect linked GitHub text/tree/search; file can read an owner-selected knowledge document; personal can retrieve approved context and prepare a persisted productivity task; planning can retrieve context and draft. These roles have different allowed tools. They are not independently running model processes.

## Lifecycle and API

All routes use the existing session cookie. Writes also require the existing `X-CSRF-Token`. Responses contain request IDs, use no-store, and never return another user's task. List is capped at50 tasks; event detail at200 entries. Inputs and outputs may be private and are not logged.

| Route | Behavior |
| --- | --- |
| `GET /api/agents/tools` | Configured tool identities and execution limits. Inference tools require a recently verified text model. Runtime adapters still validate credentials, subscription and availability. |
| `GET /api/agents/tasks` | Owner's latest tasks; activates queue polling. |
| `POST /api/agents/tasks` | `{objective,model,requestKey,plan?}`. UUID requestKey is idempotent; changed input under the same key returns409. Creates a draft. |
| `GET /api/agents/tasks/:id` | Owner-scoped plan, steps, results, status and event timeline. |
| `POST .../:id/start` | Starts a draft. Without a plan, calls the existing model service for validated JSON; stores the plan and returns to draft for review. Starting the reviewed draft executes it. |
| `POST .../:id/approve` | `{stepId,approved:true}`; only a currently waiting step in this owner's task can be approved. Approval and audit insertion are transactional. |
| `POST .../:id/resume` | Explicit recovery of failed or interrupted running work after acquiring its lock. Completed steps remain completed. Unfinished actions lose prior approval. |
| `POST .../:id/cancel` | Cancels unfinished work; aborts the local request and propagates through database status polling across processes. |

States: draft, ready, running, waiting_for_approval, completed, failed, cancelled. Steps and dependencies reference earlier steps; execution is intentionally sequential. The model cannot supply executable source, arbitrary tool names, shell commands, or approval flags. Generated plans must end with a draft synthesizing prior results. Manual plans can contain only locally available tools and may run without inference when no draft step is present.

The final draft receives earlier results as untrusted reference data. Browser live-view/session/connect URLs, cookies and authorization fields are removed from that model context. User-approved non-sensitive memory is retrieved using the existing context service; disabled memory remains disabled. Existing account APIs retain explicit memory save/edit/delete and sensitive-item consent. The engine never silently creates a memory or trains a model.

## Permissions and recovery

All record creation and browser click/type/key steps pause for a stored backend approval. Plans and step inputs cannot be edited after creation through this API; model output cannot grant approval. Approvals are scoped to an exact task and step and written to existing append-only `audit_logs`. Other account/browser/chat routes retain their previous permission contracts; this milestone does not retrofit stored approvals into the legacy chat loop.

Task creation has a global transactional queue limit20, at most3 active/draft/waiting tasks per owner, and50 creations per owner per day. Execution has at most8 steps,3 attempts per unfinished step/planning operation and2 global worker slots. PostgreSQL session advisory locks prevent two processes executing the same task and bound worker concurrency. Defaults use a60-second deadline per step. No worker executes arbitrary host code.

Before starting each step the worker locks and checks task state transactionally. Completion/output writes also lock/check state, so a cancelled task cannot commit a later result or task record. Productivity record insertion and the step checkpoint share one transaction, avoiding duplicate record creation on replay. The existing productivity count/byte quota is preserved.

Cancellation cannot undo an external action that already reached a provider or website. Browser/GitHub requests also retain their existing network timeouts; read-only operations that cannot abort immediately discard late output. Interrupted external actions have an uncertain outcome and require inspection and fresh approval before retry. There are no automatic retries of side effects. Remote browser connections receive abort signals; terminal browser tasks request session release through the existing adapter. Approval waits preserve the current session and remain subject to the existing provider expiry.

Queued work continues while the server process lives after an agent API has activated the worker. After restart, the next agent interaction reactivates queued work. Interrupted running work requires explicit resume; there is no automatic claim that a previously running side effect did not occur. Runtime tests simulate lost execution state in PostgreSQL; a physical process-kill/restart test has not been performed.

## Setup and migrations

Use the prepared repository dependencies and existing PostgreSQL setup. Back up the target database and review `database/MIGRATIONS.md` before running:

```sh
npm run db:migrate
npm run dev
```

Migration `0049_agent_execution.sql` adds agent_tasks, agent_steps, agent_events, foreign keys, indexes and RLS with no public policies. It neither drops nor rewrites existing data. The trusted backend connection must have the required table permissions. All API ownership is enforced in backend SQL. Do not roll back by deleting production history; use a forward migration if requirements change.

| Variable / configuration | Purpose |
| --- | --- |
| `DATABASE_URL` and existing TLS settings | Persistent account/session/task storage. |
| `DATABASE_POOL_MAX` | Use at least worker concurrency +2 connections; default5 supports default concurrency2. |
| `AFG_AGENT_CONCURRENCY` | New bounded worker setting, integer1–2; invalid values default2. |
| `AFG_AGENT_TIMEOUT_MS` | New per-step deadline, integer1000–120000; invalid values default60000. |
| Existing9Router/APInex/Ollama configuration | A recently verified text model is required for natural-language planning and drafting. Model IDs and manual selection pass through the existing gateway; no new AI provider or default was added. |
| `TAVILY_API_KEY` or verified Admin Web Search connection | Existing research integration. Presence alone does not prove usable quota. |
| `BROWSERBASE_API_KEY` | Existing remote browser service; obtain from its administrator/dashboard. Sessions remain user-isolated. No Android OS control is provided by this server browser. |
| Existing linked GitHub connection | Enables permitted repository read tools for that account. No new token storage or Git transport was introduced. |

Keys stay server-side. This commit adds no dependency or deployment action. New variables and the existing browser key are listed in `.env.example`, with no secret values.

## Verification and feature status

- **Implemented and verified:** real PostgreSQL multi-step execution, approval before record creation, exactly one transactional record, idempotency conflict/replay, owner isolation, CSRF, retry without rerunning completed steps, interrupted-step recovery and renewed approval, cancellation during a blocked database read, existing memory CRUD/ownership, and private-browser-field filtering from model reference context.
- **Implemented and locally verified:** Automation workspace desktop/mobile navigation, actual API plan/start/approval/completion, history after refresh, localized Dari RTL/light view, no390px overflow and automated accessibility scans.
- **Implemented but externally unverified:** model-generated planning/final synthesis, live Tavily/Browserbase/GitHub operations, remote browser cancellation/session release and local Ollama inference. The emulator v0.0.1 catalog was inspected; it contains no suitable model/Tavily/Browserbase replacement. Synthetic model success was not substituted.
- **Partially implemented:** specialist supervisor, research/knowledge pipeline, resumability and workflow reuse. Plans are stored and can be submitted again with a new requestKey, but there is no named workflow library, scheduler, visual builder, dependency parallelism, dynamic output-to-input binding, automatic replanning or clarification inbox. Browser element refs cannot be invented ahead of a snapshot; workflows needing later-selected refs require another reviewed plan. This limits unattended interactive browsing.
- **Existing and reused:** user-controlled memory and full-text private-knowledge retrieval. Memory categories and UI remain those of the existing account service. No new vector database was introduced.
- **Not implemented:** host shell execution, coding file edits/tests/commits/PR creation through this agent registry, desktop OS control, new native Android automation, notifications and physical-device testing. Existing underlying tools/plugins remain in place; they are not exposed as newly verified autonomous capabilities.

Tests: `npm run lint`, `npm run build`, `npx tsx scripts/test-agent-engine.ts`, existing stream/core/task-store regressions. The agent test refuses targets other than loopback55432/afg_agent_test and uses synthetic users. Because audit entries are append-only, fixtures revoke sessions and mark synthetic accounts deleted instead of deleting audit-linked identities. No production migration or deployment was performed.

Universal acceptance status is **Incomplete**: criterion1 still has application-wide legacy localization gaps; criteria2/10 need live integration verification; criteria3/4/5 preserve authentication, gateway, ownership and checkpoints as described; criterion6 provides request IDs and bounded generic errors; criterion7 provides safe task/step/request events and durations; criterion8 reuses provider administration but has no separate agent-admin control panel; criterion9 is covered by this guide/configuration/test script. A successful build does not establish full product completion.

Further limits: existing large offline-engine build warnings remain; polling is not token streaming or push notifications; no new agent usage billing ledger was added. Task history is visible to its owner, but this workspace has no per-task deletion or retention policy yet. The inherited append-only audit policy also prevents hard deletion of an audit-linked user without a separate account-retention design.
