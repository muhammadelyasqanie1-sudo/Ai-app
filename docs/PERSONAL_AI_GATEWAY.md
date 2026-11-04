# Personal AI Gateway — AFG AI integration

This gateway is an authenticated continuity layer over AFG AI's existing provider registry and PostgreSQL conversation store. It does not create a second provider system or a separate user identity.

## Endpoint

`POST /api/gateway/chat` — cookie-authenticated AFG AI session + CSRF token.

```json
{
  "conversationId": null,
  "clientMessageId": "a-unique-uuid-for-this-user-message",
  "content": "Hello",
  "model": "auto"
}
```

- The server derives `user_id` from the authenticated session. A client-supplied owner ID is never accepted.
- The response is SSE. The first metadata event contains the stable `conversationId` and request ID; content events carry streamed text; a done event confirms the assistant answer was persisted.
- Save `conversationId` and reuse it for every turn. Generate a new `clientMessageId` per user message; reuse that same ID for network retries.
- Existing configured, verified providers and the administrator's fallback chain are used. Manual model selection remains pinned according to the existing gateway rules.
- Messages are stored in PostgreSQL. Repeating a completed `clientMessageId` replays the stored answer without calling a provider again. Reusing an ID with different content returns 409.
- A PostgreSQL advisory lock serializes turns within one conversation.

## Configuration

No new provider secret is introduced. Configure supported provider credentials through AFG AI's existing server-side provider settings/secret vault. `DATABASE_URL` and the new migration are required. A consumer ChatGPT/Claude subscription is not itself an API credential; only provider-authorized API credentials or supported OAuth integrations can be used.

## Important delivery boundary

The idempotency record prevents duplicate calls after a completed response has been saved. It cannot guarantee exactly-once billing if a provider completes generation and the process crashes before the result is committed. Provider-side idempotency is not universally available. Failed/in-progress records are retained for diagnosis; do not automatically replay a stale processing record without operator review.

The existing `/api/chat` route remains unchanged. This endpoint is an authenticated continuity API intended for clients that want one conversation ID across provider failover.
