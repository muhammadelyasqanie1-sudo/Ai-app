# AFG AI — Universal API Hub, 9Router and MCP

This document defines the integration boundary for the three requested systems. It is a phased delivery record, not a statement that every feature is production-ready.

## 1. Public APIs directory

Source of truth: `public-apis/public-apis` and its official companion directory, `publicapis.lol`.

AFG AI imports the union of both official API-directory sources: every parsed category-table row from the `public-apis/public-apis` README and every page from the companion JSON directory at `https://publicapis.lol/api/apis`. The sources are fetched independently and deduplicated by the normalized record identity, so entries present in only one source are retained. Sync reports per-source coverage; it is marked complete only after both sources reach a confirmed end. If either source is unavailable or pagination cannot be confirmed complete, the sync is partial and **does not deactivate existing catalog entries**. The README's MCP Servers table is imported separately into the MCP directory. The catalog is discoverable inside AFG AI after migrations 0012–0015 are applied and a superadmin runs **Sync catalog**.

Important boundary: a directory entry is not necessarily an executable API endpoint. Many listed links point to documentation or a product homepage. AFG AI must not blindly call those links or generate fake endpoint schemas. A listing becomes an executable tool only after its official API documentation/OpenAPI specification, authentication scheme, parameters, quota and terms have been checked and an explicit connection definition has been saved.

**Credentials are not published by the Public APIs repository.** Its rows contain authentication labels such as `No`, `apiKey` and `OAuth`, plus documentation/homepage links—not reusable provider secrets. AFG AI imports every listing as metadata and provides an owner-scoped connector vault: `none`, `Bearer` token, arbitrary API-key header (including `X-Mashape-Key`), or API-key query parameter. Secrets are encrypted server-side and never sent to the browser after save. OAuth providers that require an interactive authorization-code flow or token refresh need a dedicated provider adapter; pasting a static bearer token is not equivalent to full OAuth support. The **Configure key** action pre-fills the selected catalog record, but the owner must copy the real endpoint and obtain their own credential from the provider's official site.

Catalog filters mirror Public APIs: query, category, auth, HTTPS and CORS. The imported list is metadata, not executable endpoints. API connector definitions must be created explicitly with a real HTTPS endpoint, HTTP method, JSON Schema, authentication mode and sample arguments; the server verifies the connection before it can be enabled. Credentials are encrypted with `AFG_INTEGRATION_ENCRYPTION_KEY`. A listing's homepage/documentation URL must never be treated as an API endpoint without documentation evidence. Random discovery is a selection feature, not a provider health guarantee. Compatible connectors can optionally share a per-user `fallback_group` and priority. When the selected connector receives an upstream quota/rate-limit response (402/429), a retryable service response (408/425/5xx), or a network timeout/unreachable error, AFG AI tries the next enabled, verified connector in that same group. A fallback candidate must have the same HTTP method and exact JSON input schema; credentials and quotas remain independent for each provider. Authentication/permission failures (401/403), invalid requests, unsafe endpoints, and AFG AI's own local rate limit do not trigger fallback. This is opt-in and requires migration `0022_api_connector_fallback_groups.sql`. Quota-exhausted connectors are retained in a persistent owner-scoped queue: HTTP 402/429 parks that connector as waiting, and a valid upstream `Retry-After`/rate-limit reset timestamp makes it eligible again automatically on the next tool discovery or call. If no reset timestamp is supplied, it stays in the waiting queue until the owner re-verifies or re-enables it; the system never invents a monthly reset date. This queue requires migration `0023_api_connector_quota_queue.sql`. Every imported catalogue entry also receives a durable implementation ledger row after migration `0024_public_api_implementation_tracking.sql`. Its global discovery status progresses from `catalogued` through documentation and contract discovery; unsupported protocols remain visible rather than being deleted. Endpoint verification, credential configuration, successful probes, enabled state and quota waiting remain owner-scoped in each user's connector records and persistent queue. Re-syncing the directory updates source metadata but never resets per-entry implementation progress. The admin panel reports source-by-source sync coverage and counts by implementation status. A successful OpenAPI discovery linked to a catalogue record advances that record to `contract_discovered`; this is not the same as a successful endpoint probe or an enabled connector.

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

Current milestone: dual-source backend catalog synchronization/browsing, persistent per-entry implementation tracking and source coverage, user-owned API connector execution, chat tool orchestration for enabled API/MCP connectors, and opt-in API connector fallback groups. Remaining work includes broader per-provider OpenAPI coverage, provider-specific OAuth authorization/refresh, API-specific adapters for non-JSON/binary and streaming protocols, scheduled health checks, deeper model-specific image-edit parameter support and full runtime acceptance. The chat tool discovery currently exposes up to 32 enabled, verified personal API connectors per request to keep model tool context bounded; fallback-group metadata is included in each tool description. The catalog, connector builder/executor, fallback-group runtime, MCP directory/runtime foundations and 9Router multimodal proxy are source-implemented but are not production-verified until the required migrations, secrets, providers and acceptance checks are applied. The repository catalog does not contain credentials or a universal executable contract, so there is no safe way to auto-enable every listed service without provider-specific configuration.

## OpenAPI discovery milestone

Authenticated users can submit a public HTTPS URL for an OpenAPI 3.0/3.1 JSON document to `POST /api/api-hub/openapi/discover`. The server rejects private/reserved document hosts, redirects, oversized documents and non-JSON specifications. It returns up to 100 operations with endpoint templates, supported scalar path/query/JSON-body parameters, security-scheme hints and an explicit `usable` flag. Both the specification host and each advertised operation-server host are checked for public HTTPS DNS/IP targets before an operation is surfaced. Discovery is metadata-only: it does not create or enable connectors, does not store credentials, and does not call the discovered operations. YAML, remote references, complex nested schemas, OAuth authorization flows, multipart uploads and binary/streaming operations are not imported by this first pass. Every imported endpoint still passes the connector executor's own HTTPS/SSRF checks and must be configured, credentialed and verified by its owner.


## Capability labels in the Public API catalog

Catalog search results now include a derived `capability` label (AI/language, image, coding, weather, finance, maps, news, food, or general) based on the upstream category, name, and description. This is discovery metadata only: it does not certify that an API can generate images, run code, or perform another capability. A connector still requires its real endpoint contract, supported request schema, required credentials, and a successful verification before it can be enabled.


## Durable catalogue discovery queue

Migration `0025_public_api_discovery_work_queue.sql` adds a persistent review queue for all tracked catalogue entries. The admin panel can claim a bounded batch (up to 25; default 10), inspect the catalogue's candidate documentation link, and record one of four outcomes: official docs verified, OpenAPI contract found, unsupported with a reason, or return to queue. Claims have a 20-minute lease; interrupted work becomes claimable again and concurrent admins cannot claim the same row. Queue completion is an administrative review record only: it does not prove endpoint health, authenticate a user, test a paid quota, create a connector, or enable an API. Official HTTPS URLs and human-supplied reasons are validated before recording. The queue intentionally avoids speculative endpoint extraction and automated third-party calls.


## Official documentation discovery

The admin work queue can scan an already-claimed catalogue entry's official HTTPS docs/homepage. The bounded scanner refuses redirects, private/reserved DNS targets, cross-host documentation links, and oversized responses. It records only evidence explicitly present in the page: protocol/authentication terms and same-host OpenAPI/Swagger link candidates. A candidate spec is not automatically imported or trusted; it must be reviewed and parsed as an OpenAPI contract separately. These labels never mark an endpoint verified, establish quota/reset information, configure credentials, or enable a connector. Requires migration 0026.


## AI chat tool routing

Verified, enabled owner API connectors and verified remote MCP tools are supplied to the chat model as function tools. Tool execution is limited to the authenticated owner's configured tools; connector credentials remain server-side. The model can request a tool, AFG AI validates the returned tool name and JSON arguments, executes it through the existing connector/MCP security and quota controls, adds the bounded result to the conversation, and asks the model to continue. Per turn, the chat handler allows up to three tool rounds and five calls in each round; tool results are capped before being returned to the model.

When tools are present, model routing now requires a recently verified model whose catalog explicitly advertises tool-calling support. Auto mode selects a verified tool-capable model (preferring the lowest known combined input/output price); routing combos select only tool-capable members. Manually selected models without tool support return a clear error instead of silently ignoring the configured APIs. Automatic fallback candidates are also filtered for tool support so a later round does not lose the ability to call tools. If a provider's capability metadata is inaccurate, AFG AI does not assume support; the model/provider catalog must be corrected and verified.

## Streaming API responses

Verified and enabled connectors also expose an owner-authenticated `POST /api/api-hub/connectors/:id/stream` route. It forwards the upstream response body progressively without first buffering the full response, preserving the upstream media type for Server-Sent Events, NDJSON, text, audio, video and binary streams. The proxy enforces the same endpoint validation, encrypted credentials, per-connector request limit, quota evidence, owner scoping and compatible fallback behavior before response headers are sent. A stream is capped at 16 MB and a 120-second upstream timeout; client backpressure is respected. If a stream fails after headers have been sent, SSE clients receive an error event where possible, while non-SSE connections are terminated rather than returning a misleading complete file.

The connector panel's **Stream response** action renders text/SSE/NDJSON chunks as they arrive. Audio and video bytes are transferred progressively and become playable/downloadable after the transfer completes in the browser; this does not claim low-latency live media playback. Streaming uploads, automatic model tool streaming, resumable streams, and provider-specific WebSocket protocols are not included in this milestone.

## Binary API responses

Connector calls now distinguish JSON/text responses from binary payloads using the upstream `Content-Type`. Binary responses are read with a streaming 8 MB cap and returned with a sanitized filename, validated MIME type and byte size. The connector panel previews PNG, JPEG, GIF and WebP responses and offers a browser download for other file types (including PDF, audio and video). SVG/HTML and other active content are never embedded as previews. Binary bytes are not inserted into chat context; automatic tool calls receive metadata only and direct file download is available from the connector panel. The browser download is temporary client-side delivery, not permanent server storage: the existing private file library keeps uploads quarantined while malware scanning is not configured, so API outputs are not silently written into that library. Audio/video playback and persistent approved-file storage require separate work.

## Multipart form-data uploads

Owner-configured connectors may declare `"x-content-type": "multipart/form-data"` on the root input schema and file properties as `{"type":"string","format":"binary"}`. The connector panel then exposes file pickers for those declared fields. Calls are authenticated with the existing session and CSRF protections; the server accepts at most 12 MB per multipart request and 10 MB per individual file, validates declared field names, and constructs a fresh outbound `FormData` request so the upstream multipart boundary is generated by the runtime. Credentials remain server-side and are not included in form fields. OpenAPI `multipart/form-data` request bodies with primitive fields and binary file properties are discovered. Required-binary operations are deliberately excluded from automatic chat tool discovery until a conversation attachment handoff is implemented; they remain callable through the connector panel, where a real file can be supplied during verification and execution. A connector requiring a file is not marked verified until the upstream accepts a request containing the selected file. Binary upload fields are never exposed as ordinary model-generated text arguments.

## OpenAPI parameter routing and HTTP Basic schemes

OpenAPI-discovered primitive parameters retain their declared location when converted into a connector schema: path parameters are substituted into the URL template, query parameters are URL-encoded, JSON body properties are sent in the JSON payload, and safe documented header parameters are sent as headers. Reserved transport and authentication headers are rejected so a tool argument cannot override credentials or connection framing. Cookie parameters remain unsupported and are marked for review. OpenAPI HTTP Basic security schemes are recognized as Basic credentials and can be configured through the encrypted connector vault; OAuth2 flows remain separate and are not treated as static bearer credentials.

## HTTP Basic authentication for personal API tools

The connector vault supports documented HTTP Basic authentication in addition to no-auth, bearer tokens, API-key headers and API-key query parameters. For Basic auth, the owner enters the provider-issued username and password as `username:password`; the server constructs the Authorization header for the upstream request. The combined credential is encrypted at rest, never returned to the browser, and is redacted from response previews. OpenAPI HTTP `basic` security schemes are recognized by the connector setup UI. Basic auth is not inferred from a generic OAuth label, and it does not replace OAuth authorization-code or token-refresh flows.

## Nested JSON request schemas for API tools

Verified owner-configured API connectors accept bounded nested JSON objects and arrays in their tool input schemas, including nested required fields, scalar enums, string length limits, array item limits and numeric bounds. Validation rejects unknown object properties, unsupported schema types, excessive nesting and oversized arguments before any upstream request is sent. This expands support for real JSON APIs whose request bodies are not flat scalar maps; it does not automatically translate multipart, binary, YAML, remote-reference, OAuth or streaming contracts.

## OpenAPI contract extraction from discovered documentation

After the official-docs scan, the same administrator claim remains active so the next step can inspect the discovered same-host OpenAPI/Swagger candidates. The contract extractor tries a bounded number of those candidates, accepts only HTTPS links on the official documentation host, and parses supported OpenAPI 3.0/3.1 JSON. It persists the normalized operation list, input schemas, auth requirements, tags, deprecation flags, and operation count in the existing tracking contract field. The queue item is completed only after a contract is successfully extracted or an administrator records another explicit outcome. No endpoint is called, no quota is inferred, and no connector is enabled by extraction. Existing contract metadata is not proof of endpoint health or credentials.


## OpenAPI authentication and quota evidence

The contract extractor also records the OpenAPI security schemes and effective root/operation security requirements, including API-key location, HTTP bearer/basic schemes, OAuth2 flow metadata and required scopes, and OpenID Connect declarations. It separately inspects explicitly declared response headers and documented extension/text hints for rate limiting, quota, retry and reset behavior. These findings are stored inside the extracted contract and shown in the admin catalogue detail view. Missing evidence remains `unknown`; no numeric quota, reset date, free tier, or live remaining balance is inferred. A declared `Retry-After` or `RateLimit-Reset` header is only a documented contract hint until an actual upstream response is received. Documentation evidence never configures credentials, authorizes an OAuth flow, verifies an endpoint, or enables a connector. Cookie-based API keys and unsupported auth flows remain manual-review requirements.
