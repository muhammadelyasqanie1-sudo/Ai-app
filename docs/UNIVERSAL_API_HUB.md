# AFG AI — Universal API Hub, 9Router and MCP

This document defines the integration boundary for the three requested systems. It is a phased delivery record, not a statement that every feature is production-ready.

## 1. Public APIs directory

Source of truth: `public-apis/public-apis` and its official companion directory, `publicapis.lol`.

AFG AI reads the upstream repository README directly from `public-apis/public-apis` and imports every row from its category tables (API name, description, auth type, HTTPS/CORS flags, category and source link). It also imports the README's MCP Servers table into the separate MCP directory. If the GitHub README is temporarily unavailable or the parser detects an unexpectedly small catalog, API metadata sync falls back to the companion JSON directory at `https://publicapis.lol/api/apis`. The catalog is discoverable inside AFG AI after migrations 0012–0015 are applied and a superadmin runs **Sync catalog**.

Important boundary: a directory entry is not necessarily an executable API endpoint. Many listed links point to documentation or a product homepage. AFG AI must not blindly call those links or generate fake endpoint schemas. A listing becomes an executable tool only after its official API documentation/OpenAPI specification, authentication scheme, parameters, quota and terms have been checked and an explicit connection definition has been saved.

**Credentials are not published by the Public APIs repository.** Its rows contain authentication labels such as `No`, `apiKey` and `OAuth`, plus documentation/homepage links—not reusable provider secrets. AFG AI imports every listing as metadata and provides an owner-scoped connector vault: `none`, `Bearer` token, arbitrary API-key header (including `X-Mashape-Key`), or API-key query parameter. Secrets are encrypted server-side and never sent to the browser after save. OAuth providers that require an interactive authorization-code flow or token refresh need a dedicated provider adapter; pasting a static bearer token is not equivalent to full OAuth support. The **Configure key** action pre-fills the selected catalog record, but the owner must copy the real endpoint and obtain their own credential from the provider's official site.

Catalog filters mirror Public APIs: query, category, auth, HTTPS and CORS. The imported list is metadata, not executable endpoints. API connector definitions must be created explicitly with a real HTTPS endpoint, HTTP method, JSON Schema, authentication mode and sample arguments; the server verifies the connection before it can be enabled. Credentials are encrypted with `AFG_INTEGRATION_ENCRYPTION_KEY`. A listing's homepage/documentation URL must never be treated as an API endpoint without documentation evidence. Random discovery is a selection feature, not a provider health guarantee. Compatible connectors can optionally share a per-user `fallback_group` and priority. When the selected connector receives an upstream quota/rate-limit response (402/429), a retryable service response (408/425/5xx), or a network timeout/unreachable error, AFG AI tries the next enabled, verified connector in that same group. A fallback candidate must have the same HTTP method and exact JSON input schema; credentials and quotas remain independent for each provider. Authentication/permission failures (401/403), invalid requests, unsafe endpoints, and AFG AI's own local rate limit do not trigger fallback. This is opt-in and requires migration `0022_api_connector_fallback_groups.sql`.

The README's MCP server rows are stored separately in `mcp_directory_catalog`. A directory listing is not an enabled MCP connection. Each remote Streamable HTTP server must be added by an authenticated owner, pass HTTPS/DNS/IP SSRF checks, complete the MCP handshake and expose validated tools before execution. STDIO execution remains disabled.

## 2. 9Router gateway

AFG AI treats 9Router as an optional, separately hosted upstream gateway, not as a library embedded in the React app. Its OpenAI-compatible model endpoint is registered as the `9Router Gateway` provider. This preserves AFG AI's existing provider gateway, per-user access policy, verified model catalog, fallback policy and request IDs.

Set server-only variables on the AFG AI hosting service:
- `NINEROUTER_BASE_URL`: public HTTPS base for the 9Router service, with or without the `/v1` suffix, for example `https://YOUR-9ROUTER-SERVICE`.
- `NINEROUTER_API_KEY`: an API key generated in the 9Router dashboard **when 9Router's `requireApiKey` authentication is enabled**. Leave it unset only when the 9Router instance intentionally disables API-key authentication.

Host 9Router as a separate Docker web service with persistent storage for its SQLite/data directory. Use its own dashboard to configure provider OAuth/API-key connections, aliases, combos, token savers, quota/usage tracking and account-level routing. Do not expose the 9Router dashboard or its management API to ordinary AFG AI users. The current 9Router state store is instance-local and is not an AFG AI multi-tenant database.

The AFG AI server proxy exposes the documented 9Router v1 capability surface without exposing the upstream key to the browser:

| Capability | 9Router endpoint(s) | AFG AI surface |
|---|---|---|
| Chat / code generation | `/v1/chat/completions`, `/v1/messages`, `/v1/responses` | Registered as the 9Router chat provider; chat model discovery and streaming use the existing gateway |
| Response utilities | `/v1/responses/compact`, `/v1/messages/count_tokens`, `/v1/systemone` | Authenticated server proxy routes |
| Model discovery | `/v1/models`, `/v1/models/{kind}`, `/v1/models/info` | Live model lists and metadata in the 9Router panel |
| Image generation | `/v1/images/generations` | 9Router multimodal panel |
| Speech | `/v1/audio/speech`, `/v1/audio/voices` | Voice discovery and TTS |
| Transcription | `/v1/audio/transcriptions` | STT with language, prompt and response-format options |
| Embeddings | `/v1/embeddings` | Batch text embeddings, optional dimensions and float/base64 encoding |
| Web search | `/v1/search` | Web, news and X search with provider filters |
| Web extraction | `/v1/web/fetch` | URL to Markdown, text or HTML |
| Video jobs | `/v1/videos/generations`, `/edits`, `/extensions`, `/{request_id}` | Async create/poll workflow with account-bound connection ID |

The 9Router README groups upstream connections into OAuth/subscription providers, no-auth/free providers, 40+ API-key providers and self-hosted services. Self-hosted adapters include STT, TTS and embeddings endpoints. Its supported client integrations include coding assistants and agent clients such as Claude Code, Codex, GitHub Copilot, Cursor and OpenClaw. AFG AI discovers the model catalog dynamically rather than hardcoding a supposedly free provider list. Provider pricing, quota, free-tier status, region access and model availability can change independently.

Because one `NINEROUTER_BASE_URL` currently points to one shared 9Router instance and its provider accounts, AFG AI limits the 9Router proxy to administrator/superadministrator accounts. Do not expose a shared owner-funded gateway to ordinary users until separate per-user 9Router instances or an equivalent isolated credential/account model is deployed.

The 9Router README also documents RTK and Headroom token savers, Ponytail/Caveman prompt compression, smart subscription→cheap→free fallback, quota tracking, provider format translation, multi-account round-robin/priority routing, OAuth token refresh, custom combos, request logs, cloud sync, usage analytics and deployment options. Those are capabilities of the separately hosted 9Router instance and are configured/managed in its own dashboard; AFG AI links to that dashboard but does not reimplement undocumented management APIs. The dashboard's own persistent data volume must be retained. No feature bypasses provider quotas, subscription terms, regional availability or billing.

The expected 9Router capability surface includes chat/LLM, embeddings, TTS, STT, image generation, vision, video generation, web search and web fetch, plus provider/CLI compatibility, model combos, multi-account round-robin/fallback, OAuth refresh, format translation, quota and usage analytics, request logs, RTK, Headroom, Caveman/Ponytail, cloud sync, tunnel, proxy pools and MITM bridge. AFG AI will expose only capabilities whose actual endpoint, provider permission, security model and usage are verified. Subscription or account limits are not bypassed; no "unlimited" guarantee is made.

Some 9Router functions (MITM interception, browser/session-cookie based sign-in, proxy rotation intended to evade provider/geographic restrictions, or sharing a user's provider credentials across tenants) are not enabled by this integration. They require separate legal/security review and must never weaken account isolation or provider terms.

## 3. MCP servers

MCP directory listings and MCP runtime are separate concerns. A server can be catalogued without being safe to execute. User-configured remote Streamable HTTP MCP servers should be supported with HTTPS-only endpoints, DNS/IP SSRF protection, per-owner encrypted credentials, explicit user consent, tool-schema validation, bounded timeouts/output, audit logging and per-tool quotas.

STDIO MCP processes must remain disabled until a hardened isolated worker is deployed. Never execute a command supplied by a browser request inside the AFG AI API process. MCP tool results are untrusted data and cannot change system policy or security controls.

## 4. Data and operational boundaries

- Provider calls and secrets stay server-side. No API secret is ever placed in a `VITE_*` variable.
- User-owned API/MCP credentials are encrypted with `AFG_INTEGRATION_ENCRYPTION_KEY`; global provider gateway keys use `PROVIDER_KEYS_MASTER_KEY`.
- Catalog metadata is globally readable to signed-in users; catalog refresh is superadmin-only.
- API calls require a configured connection and a verified request definition. Catalog import does not run third-party APIs.
- Database migration 0012 is additive. Apply it explicitly after reviewing database backup/restore guidance.
- The 9Router service and its persistent data volume must be provisioned separately. Source changes do not create hosting resources or external credentials.
- Tests, builds, migrations and deployments remain separate explicit operations.

## 5. Delivery status

Current milestone: backend catalog synchronization/browsing, user-owned API connector execution, chat tool orchestration for enabled API/MCP connectors, and opt-in API connector fallback groups. Remaining work includes automated OpenAPI discovery/import, provider-specific OAuth authorization/refresh, API-specific adapters for non-JSON/binary and streaming protocols, scheduled health checks, deeper model-specific image-edit parameter support and full runtime acceptance. The catalog, connector builder/executor, fallback-group runtime, MCP directory/runtime foundations and 9Router multimodal proxy are source-implemented but are not production-verified until the required migrations, secrets, providers and acceptance checks are applied. The repository catalog does not contain credentials or a universal executable contract, so there is no safe way to auto-enable every listed service without provider-specific configuration.
