# BeatAPI integration guide (AFG AI)

This guide captures the supported setup for the public BeatAPI agent skill at
[https://beatapi.io/SKILL.md](https://beatapi.io/SKILL.md) and the current
BeatAPI API documentation. The skill is an instruction document for an agent;
reading it does not itself authenticate AFG AI or grant permission to run tasks.

## Server configuration

Set these variables on the backend service (Railway/Render), never in browser
variables such as `VITE_*`:

- `BEATAPI_API_KEY`: a key created in BeatAPI Dashboard → API Keys.
- `BEATAPI_BASE_URL`: `https://api.beatapi.io` (default for catalog and
  capability APIs).

AFG AI appends `/v1` for the OpenAI-compatible chat adapter. The key must remain
server-side. If it has ever been pasted into a chat, source file, issue, or log,
revoke it and create a replacement.

## Recommended no-top-up chat model

Use the exact model ID:

```text
glm-5.3-flash-free
```

It is a separate free model ID, not an alias for the paid model
`glm-5.3-flash`. It uses the OpenAI-compatible endpoint:

```text
POST https://api.beatapi.io/v1/chat/completions
Authorization: Bearer $BEATAPI_API_KEY
Content-Type: application/json
```

Example request:

```json
{
  "model": "glm-5.3-flash-free",
  "messages": [
    { "role": "user", "content": "Hello. Reply in one sentence." }
  ],
  "stream": true
}
```

Free model access has a strict per-account rate limit: one successful request
per minute before the first top-up, and up to ten per minute after. The daily
allowance can change; free access may be rate-limited or withdrawn. A 429
response must be retried only after the supplied `Retry-After` interval.
AFG AI's OpenAI-compatible streaming adapter now honors that header and retries
429/500/503 once; it does not loop indefinitely.

## Paid model — explicit opt-in only

The paid sibling is `glm-5.3-flash`. The published token rates in the current
BeatAPI documentation are $0.06 per 1M input tokens and $0.20 per 1M output
tokens (cached input is separately priced). Do not silently switch a user from
the free ID to the paid ID. The paid model may incur charges.

## What AFG AI currently supports

- Server-side model catalog discovery through the configured key.
- OpenAI-compatible streaming chat using the exact model ID.
- Catalog-only health checks, so model verification does not send a billable
  generation request.
- Read-only authenticated AFG AI routes:
  - `GET /api/beatapi/status`
  - `GET /api/beatapi/models`
  - `GET /api/beatapi/workflows`
  - `POST /api/beatapi/capabilities/search`
  - `POST /api/beatapi/capabilities/inspect`
- A one-time bounded retry for transient 429/500/503 chat failures.

A newly discovered model remains disabled in the database catalog until an
administrator enables it. After deployment, enable `beatapi` and
`glm-5.3-flash-free` in the provider/model administration screen before it can
be selected for chat.

## Important capability boundaries

- The free GLM model is a text-chat model. Do not mark image/video input,
  image generation, audio, or tool execution as supported based only on the
  marketing description.
- BeatAPI's image, video, music-video and workflow capabilities are separate
  APIs and are not free merely because a free text model exists.
- AFG AI exposes read-only capability search/inspect only. It deliberately
  does not expose a task-run endpoint, because task execution may spend the
  shared BeatAPI balance.
- Direct image/video input through this gateway remains unverified. Keep those
  UI features disabled until a documented API contract and safe integration
  are implemented.

## References

- [Agent Skill setup](https://beatapi.io/skill)
- [BeatAPI Text API](https://docs.beatapi.io/text-api)
- [Free models](https://docs.beatapi.io/free-models)
- [GLM Chat Completions](https://docs.beatapi.io/api-reference/text-api/glm-chat-completions)
- [Integrations and credential safety](https://docs.beatapi.io/integrations)
