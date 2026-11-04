# AFG AI Routing Combos

AFG AI includes an internal, database-backed router inspired by multi-provider gateways.

## Strategies

- `fallback`: attempts configured models in order. A later model is used only when the earlier provider fails before emitting response content.
- `round_robin`: atomically advances a per-combo cursor for each request. With fallback enabled, remaining models in the rotated order are failover candidates; with fallback disabled, only the selected model is used.

Model IDs use `provider-slug::provider-model-id`. The API validates that every selected model is enabled, recently verified, text-capable, and streaming-capable. Models are checked again at request time. Manual model selection remains pinned; combos are explicit selections and do not silently alter manual model choices.

## Admin API

All routes require an authenticated `superadmin` session. Mutations require the application's CSRF token.

- `GET /api/admin/routing/combos`
- `POST /api/admin/routing/combos`
- `PATCH /api/admin/routing/combos/:slug`
- `DELETE /api/admin/routing/combos/:slug`

Example create body:

```json
{
  "slug": "balanced-free",
  "displayName": "Balanced Free",
  "strategy": "round_robin",
  "modelIds": ["provider-a::model-a", "provider-b::model-b"],
  "fallbackOnError": true,
  "enabled": true
}
```

## Chat API

Pass `combo::balanced-free` as the `model` value to the existing AFG AI chat gateway. Existing streaming, cancellation, usage accounting, subscription checks, and no-partial-replay protections remain active.

## Claude Code compatibility

This change implements the combo router, not a complete Anthropic Messages compatibility server. Claude Code sends tool definitions and expects tool-use response blocks; the current provider adapter contract is text-stream-only. Do not point Claude Code at the AFG AI chat endpoint and assume tool calling works. A separate tool-call contract and Anthropic-compatible bridge are required before advertising full Claude Code support.
