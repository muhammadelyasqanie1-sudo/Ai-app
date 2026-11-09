# AFG AI universal web search through 9Router

AFG AI uses the existing 9Router gateway as its primary web-search and page-reading provider. It does not require a second search gateway or expose provider credentials to the browser.

## How it works

1. AFG AI reads the live catalogue from `GET /v1/models/web`.
2. For ordinary web and news searches, it prefers an active 9Router combo model so 9Router can apply its configured provider fallback. If no combo is advertised, it selects an active compatible search model.
3. X search is routed only when an Xquik-capable model is actually advertised.
4. Deep research searches web and news; deep mode also attempts X when the connected 9Router instance exposes it.
5. When a result has too little readable text, deep research can read its public page through an active 9Router web-fetch model (fetch combo, Jina Reader, Firecrawl, Exa, Tavily, or another advertised model).
6. Results are deduplicated by URL, retained with their source URLs, and passed to the existing source comparison and citation workflow.

The web-search and web-fetch model catalogues are discovered at runtime. AFG AI does not hardcode provider model IDs or claim that a provider is available when 9Router does not advertise it.

## Existing deployment configuration

Use the existing server-only 9Router variables in Railway:

- `NINEROUTER_BASE_URL` — public HTTPS URL of the 9Router service; the value may include or omit `/v1`.
- `NINEROUTER_API_KEY` — required only when the 9Router instance enforces API keys. It can also be held in the encrypted Web Search integration credential.
- `NINEROUTER_WEB_SEARCH_MODEL` — optional exact ID from `GET /v1/models/web`; otherwise an active combo is preferred.
- `NINEROUTER_WEB_FETCH_MODEL` — optional exact ID from `GET /v1/models/web`; otherwise an active fetch combo is preferred.

No provider key is required in AFG AI when the corresponding search/fetch provider credentials are already configured in 9Router. Add or enable search and fetch providers and combos in the existing 9Router control panel. The 9Router API exposes `POST /v1/search` and `POST /v1/web/fetch`; AFG AI calls those server-to-server.

## AFG AI API and agent behavior

- `POST /api/research` accepts `query`, `max_results` (1–50), `search_type` (`web`, `news`, or `x`), and optional `time_range`, `country`, `language`, and `domain_filter`.
- The `web_search` agent tool uses the same runtime discovery and supports the same search filters.
- Deep research uses multiple search channels when available and uses 9Router web-fetch models to read thin search results.
- The existing admin `research` feature flag, account authentication, request limits, cancellation, URL safety checks, and source/citation controls remain enforced.

## Important boundaries

“Broad/unrestricted” here means AFG AI is not hardwired to one search company or one source category. It can use every web-search and fetch model that the administrator has configured and 9Router advertises, including web, news, and X where supported.

It does not mean infinite throughput or access to private, paywalled, authenticated, or prohibited material. Upstream provider quotas, network availability, site access rules, and the app's bounded request/result limits still apply. The implementation does not bypass logins, paywalls, robots restrictions, or access controls. Search results and fetched page text are untrusted data and must never be treated as agent instructions.

## Verification

Source implementation only. Do not mark this capability production-verified until the project owner authorizes a type-check/build and a real 9Router search + web-fetch smoke test against the deployed service.
