# AFG AI Reliability Contract

This document distinguishes implemented text-chat reliability behavior from capabilities that are not yet wired to a generation endpoint.

## Implemented for `POST /api/chat`

- The API edge creates a UUID request ID, forwards it to the chat handler, and returns it in the `X-Request-Id` response header. The SSE stream begins with a `meta` event containing the request ID and selected model. Failed client messages display the request ID for support.
- Text generation has a 60-second server-side deadline. The deadline aborts the request signal, which is passed to the provider adapter; client disconnects also abort the signal.
- The chat service retries retryable provider failures up to three attempts per candidate model, using exponential backoff with jitter. It will not replay a partially delivered response. An empty provider response is treated as a retryable failure.
- After exhausting retries, the service moves through other enabled, health-verified text/streaming models. Requests may opt out using `no_fallback: true`.
- The browser client retries retryable failures up to three attempts with jittered backoff. It does not retry errors explicitly marked non-retryable and does not automatically replay after any response text has already arrived.
- The original user message remains in chat history after failure. Failed assistant messages expose the existing Retry action.
- Provider and request failures are logged as structured JSON with request ID, user ID when authenticated, model ID when known, latency, and a classified error code. Provider-specific codes are retained only in server logs.
- Client-facing failures use generic messages and never include provider response bodies or stack traces.

## Error classification

The chat API classifies failures as `network`, `auth`, `rate_limit`, `provider_5xx`, `invalid_request`, `content_policy`, `timeout`, or `unavailable_model`. The classification is included in error events/responses and structured server logs.

## Not yet complete

1. **Image timeout:** Image Studio currently exposes provider capability/status information only. The UI explicitly says generation is unavailable until secure asset storage and generation operations exist. Therefore the 300-second image-generation deadline is not applicable yet and must be added when the generation endpoint is implemented.
2. **Other AI capabilities:** Voice transcription and synthesis currently call provider methods outside the chat reliability wrapper. They still need request-ID propagation, bounded upstream timeouts/cancellation, retry classification, and structured user/model/latency logs before this contract can be claimed for every AI capability.
3. **Provider-specific cancellation:** The chat timeout aborts the shared signal passed into the chat adapter. Every future adapter must honor that signal and cancel its upstream request/reader.
4. **Fallback ordering:** Text fallback currently follows the verified model descriptor order returned by the provider gateway. If product policy requires an administrator-defined capability chain, that order should be made explicit in configuration.
5. **UI no-fallback control:** The API accepts `no_fallback: true`; a user-facing setting has not yet been added.

## Release note

The text-chat path now has the core reliability controls, but this is **not yet a global guarantee for all AI calls**. Do not advertise the full contract as complete until voice and future image/video generation endpoints use the same reliability layer and the project has been verified with tests.


## Model selection and fallback safety

- A manually selected model is pinned to its exact provider/model identity. If it is unavailable or not recently verified, the request fails with a clear error rather than silently switching models.
- Auto mode selects an initial healthy model using configured selection/pricing data. Subsequent failover is restricted to the ordered model IDs configured by an administrator for that capability.
- Fallback candidates must still be enabled, recently health-verified, and support the requested text-streaming capability. If no valid fallback policy is available, AFG AI does not silently try arbitrary providers.
