# AFG AI Tool Modules 3.6–3.10

## Coding Assistant (3.6)
The chat API accepts `toolMode: "coding"` plus an allowlisted `codingTask` (generate, explain, debug, refactor, optimize, document, test, SQL, Git or general) and applies a dedicated coding system prompt. It supports code generation, explanation, debugging, refactoring, optimization, documentation, test generation, SQL, Git and GitHub guidance. User code is never executed by this API or on the main application server. A future runner must be a separate isolated service and remain disabled behind an explicit feature flag until configured.

## Writing Studio (3.7)
The client sends structured fields: `writingTemplate`, `writingTone`, `writingStyle`, `writingLanguage`, and `writingLength`. The server validates each field against an allowlist and constructs the system prompt; arbitrary UI text is not used as a substitute for these controls.

Supported templates: email, article, blog, proposal, CV, cover letter, social post, product description, advertisement, story and script.

## Translation (3.8)
The `toolMode: "translation"` chat path supports automatic source detection or explicit source override, with English, Persian/Dari, Pashto and Arabic target codes. Long inputs are divided into paragraph-aware segments of approximately 6,000 characters before being passed to the model, with instructions to preserve order, terminology, paragraph boundaries and markup.

The current document picker supports text-based TXT, Markdown, CSV and JSON files up to 45 KB. PDF and DOCX extraction is not enabled because the secure document extraction pipeline is not yet configured.

## Voice (3.9)
Provider contracts include transcription, synthesis and optional provider-declared voice choices. Server routes:
- `POST /api/voice/transcribe` — base64 audio plus MIME type; maximum 10 MB.
- `POST /api/voice/synthesize` — text plus optional provider voice ID; maximum 5,000 characters.
- `GET /api/voice/voices` — voice choices declared by verified providers.

The UI and chat microphone/read-aloud controls are capability-gated and also respect the user's saved voice preference. Voice requests have per-IP rate limits and bounded concurrent processing. Chat voice input records audio and sends it to the STT endpoint; optional conversation mode forwards the transcript into chat. Assistant read-aloud uses the provider TTS endpoint. A model is not advertised for STT/TTS unless its provider adapter implements the corresponding method. The current Cloudflare and OpenAI-compatible adapters do not implement STT/TTS, so these controls remain disabled until a compatible adapter/model is added.

## Web Research (3.10)
The research API uses Tavily only when `TAVILY_API_KEY` is configured on the server and applies per-IP request limits and bounded concurrent searches. Add this variable in Render's environment settings; never expose it as a `VITE_*` client variable. The server returns only HTTP(S) URLs actually present in Tavily's response. The UI labels those as verified sources and sends their exact URLs and excerpts to the model for a separately labeled AI interpretation. No search provider configured means research returns HTTP 503 and remains unavailable.

## Safety and operational notes
- No user-supplied code execution is implemented.
- Provider credentials remain server-side.
- Voice and research are disabled unless the required provider capability/configuration is present.
- No test, type-check, build, migration or deployment is implied by these source changes.
