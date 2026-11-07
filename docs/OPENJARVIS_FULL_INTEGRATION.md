# Full OpenJarvis integration into AFG AI

**Status: complete upstream source snapshot imported and verified; runtime/UI bridge integration is in progress.**

This document is the integration contract for bringing the complete upstream OpenJarvis project into AFG AI without replacing the existing AFG application or silently dropping upstream components.

## Upstream source lock

- Repository: https://github.com/open-jarvis/OpenJarvis
- Upstream ref at audit time: `c5a7766e04d4d7dc114d3182bd07914f45a48b2d`
- License: Apache-2.0. Keep the upstream `LICENSE`, NOTICE/attribution files, copyright headers, and modification notices with the imported source.
- Import destination: `vendor/OpenJarvis/`
- Import method: a complete source snapshot (not a handful of copied modules). Preserve source, tests, docs, examples, assets, Rust workspace, desktop/Tauri app, frontend, scripts, configs, lockfiles and build metadata. Do not copy credentials, local runtime data, caches, generated binaries, or user data.

The workflow `.github/workflows/import-openjarvis.yml` has successfully imported the full upstream snapshot into `vendor/OpenJarvis/` on `feat/openjarvis-full-integration`. Exact Git-tree comparison against the pinned upstream revision found 2,461 upstream entries (2,202 files), zero missing entries, zero SHA/type mismatches, and one intentional extra lock file. The source snapshot is present; the original upstream `.git` metadata is omitted.

## Full upstream inventory that must remain accounted for

| OpenJarvis area | Full project scope | AFG AI integration target |
|---|---|---|
| Core / Intelligence | Core types, registries, configuration, model catalog and hardware detection | AFG server-side model/provider gateway; keep upstream engine contracts available |
| Inference engines | Ollama, llama.cpp, vLLM, SGLang, MLX and cloud engines | Python runtime adapter; reuse AFG provider credentials through a server-only adapter where possible |
| Agents | Simple, orchestrator, ReAct, OpenHands/CodeAct, RLM, Claude Code, OpenCode, Operative and Monitor Operative, plus any agents present in the pinned source | AFG chat/agent selector and authenticated agent-run API |
| Tools | Calculator, retrieval, search, browser, code execution, shell, files, Git, PDF, image/audio, MCP, database and other registered tools | Server-side permission catalog; capability and ownership checks before each invocation |
| Memory | SQLite/FTS5, FAISS, ColBERT, BM25, hybrid retrieval, ingestion/chunking and prompt context | Per-user persistent memory, consent, export/delete, retention and isolation |
| Skills | Skill manifests, loader/importer, executor, discovery, signed/community skills and optimization | AFG skill center with install review, trust metadata, scoped tool permissions and audit |
| Learning / traces | Trace collection, analysis, model/agent routing policies, evaluation and learning loops | Private per-user/project telemetry; no cross-user training or hidden data transfer |
| Operators / scheduler | Scheduled and continuous agents, session persistence and operator management | Durable AFG job queue, owner-scoped schedules, pause/cancel controls and audit |
| Connectors | Gmail, Drive, Calendar, Tasks and other connector integrations present upstream | AFG encrypted OAuth/connector vault and explicit user consent |
| Channels | Telegram, Discord, Slack, WhatsApp and all channel implementations present upstream | Optional, user-configured integrations; no implicit outbound messaging |
| API server | FastAPI endpoints, streaming, WebSockets, model and agent management APIs | Private Python sidecar behind the AFG Node/Express API and AFG session/RBAC boundary |
| Frontend | The complete upstream browser frontend and its routes, assets and styles | Mount/bridge as an AFG workspace without replacing the AFG shell, identity or navigation |
| CLI | `jarvis` CLI and evaluation commands | Keep available in the Python service/container; do not require CLI on Android |
| Desktop / Rust | Rust workspace and Tauri desktop application | Preserve upstream source; assess a separate desktop target rather than putting Tauri inside Android |
| Evaluation / tests / docs | Benchmarks, datasets, test suites, developer docs, tutorials, examples and release metadata | Preserve them intact; create an explicit AFG integration/verification matrix |

The inventory is intentionally broad. The pinned upstream tree, not this table or a README feature count, is the final source-of-truth for whether every file and component was imported.

## Runtime architecture

OpenJarvis is a Python project (`>=3.10,<3.14`) with native/Rust components and a separate React/Vite frontend. AFG AI is a Node/Express + React/Vite + PostgreSQL application with a Capacitor Android app. These runtimes must be joined deliberately; adding the Python source folder to the Node build does not execute it.

Target topology:

1. **AFG client remains the product shell.** AFG sign-in, chat, history, language, theme, provider selection and Android screens remain in place.
2. **Private OpenJarvis runtime.** Run the pinned Python package as a separately supervised internal service. It must not be directly public or bypass AFG authentication.
3. **Authenticated AFG bridge.** AFG API validates session, ownership, plan/quota, CSRF where applicable and tool permissions, then proxies only approved OpenJarvis operations. Propagate request IDs and cancellation; redact upstream exceptions.
4. **One provider policy.** Cloud inference must use AFG-managed server-side credentials/adapters when feasible. Never inject credentials into the browser, model prompts, traces or the imported frontend. No provider is enabled just because upstream supports its SDK.
5. **Per-user persistence.** Isolate config, persona files, memory, traces, operators, skills and connector credentials by authenticated AFG user/tenant. Provide retention and delete/export behavior. Do not share a single writable `OPENJARVIS_HOME` across users.
6. **Android remains native-first.** Existing Capacitor JARVIS controls and llama.cpp/Needle native runtime are retained. The Python/Rust desktop runtime is not an Android runtime. Connect supported OpenJarvis agent capabilities through an authenticated service, while local inference on Android continues to use verified native runtimes.
7. **Desktop remains a separate deliverable.** Preserve the Tauri/Rust application and determine whether it is shipped as an optional desktop package or a separately built workspace. Do not assume it can be loaded into the Android APK.
8. **Persistent jobs.** Scheduled/continuous agents require durable storage, a worker, concurrency limits, observability, pause/cancel/retry and per-user authorization. A web process timer is not sufficient.

## Safety gates

The following must be disabled by default until their real enforcement path is implemented and verified:

- host shell, arbitrary code execution, Docker/Podman commands and filesystem write/patch;
- browser automation, desktop interaction and Android accessibility actions;
- outbound messages, email, social/channel posts and other external side effects;
- database writes, MCP tools, connector actions and skill installation;
- autonomous schedules or continuous agents that can act without a user present.

Before enabling any of them, require an allowlisted capability, explicit per-user consent, a scoped sandbox, resource/time/output bounds, ownership checks, an approval step for consequential actions and an audit record. Preserve the existing AFG Android confirmation model; do not give an LLM direct access to native device APIs.

## Dependency and deployment constraints

- Do not install every optional upstream extra blindly. Resolve extras per enabled capability and target OS/architecture.
- Build/test Python/Rust/native extensions in the appropriate environment. Railway's current Node process alone does not prove Python or Rust support.
- Add a persistent volume and backup/restore plan for runtime data before enabling memory, traces or operators.
- Keep upstream configuration and generated data outside the web build and APK assets.
- Do not run the Python API on a public port. Internal networking and AFG authentication are mandatory.
- Do not run migrations, builds, tests, provider calls or deployments without the owner's explicit authorization.

## Completion gates

This transfer is **not complete** merely because the source snapshot exists. It can be marked complete only after all of the following are evidenced:

- [x] Entire pinned upstream repository snapshot imported; upstream license/notice and exact SHA retained.
- [x] Git-tree inventory comparison: 2,461/2,461 entries match; zero missing and zero mismatched blobs.
- [ ] Automated inventory comparison proves there are no omitted tracked source/docs/tests/assets/Rust/frontend files (excluding only explicitly documented generated/user-local artifacts).
- [ ] Python service starts on the chosen host and reports health; shutdown/restart is safe. A Dockerfile and Railway setup guide have been added; a separate Railway service, secret and persistent volume still need configuration.
- [x] AFG authentication, CSRF for chat, request IDs, cancellation and structured error mapping cover the currently exposed OpenJarvis proxy routes.
- [ ] Per-user isolation, quotas and structured audit coverage for all upstream route families.
- [ ] AFG UI has working entry points for the full upstream agent/tool/skill/memory/operator/connector/channel/trace/admin surfaces. The initial authenticated chat/model/status panel is mounted in the existing AFG AI Assistant screen.
- [ ] Full upstream frontend is available within the agreed AFG navigation model, without bypassing AFG session/security. The upstream frontend source is preserved but not yet mounted.
- [ ] Cloud and local engines are discovered and health-checked; only genuinely configured engines/models are selectable.
- [ ] All dangerous capabilities are denied by default and individually permission-gated/sandboxed.
- [ ] Existing AFG chat, history, provider management, offline hub, Android JARVIS and APK build path are preserved.
- [ ] Python/Rust/frontend/native workflows and Android hardware paths have been verified on their target platforms.
- [ ] Backup/restore, retention, deletion, operational monitoring, rollback and release documentation are complete.

Until these gates pass, report each feature as **Partially Implemented** or **Blocked**. Do not describe the source import as a finished JARVIS migration.
