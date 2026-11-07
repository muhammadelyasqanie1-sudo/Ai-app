# OpenJarvis private runtime for AFG AI

This service runs the **complete pinned OpenJarvis Python server** as a separate private process. It is intentionally not bundled into the browser build or Android APK.

## Build

Use the AFG AI repository root as the Docker build context and select:

- Dockerfile path: `services/openjarvis/Dockerfile`
- Build context: repository root
- Runtime port: `8787`

The image installs the upstream locked dependency set plus the upstream `server` extra. It starts the official `jarvis serve` command.

## Required runtime variables

Set these on the OpenJarvis service:

- `OPENJARVIS_API_KEY`: a newly generated, high-entropy secret. This is the internal service credential; do not reuse a provider API key.
- `OPENJARVIS_HOME=/data/openjarvis`: runtime data directory.
- `OPENAI_API_KEY` and `OPENAI_BASE_URL` or other upstream-supported engine credentials/configuration, only if the selected OpenJarvis engine requires them.
- `OPENJARVIS_CORS_ORIGINS`: leave empty for the private server-to-server bridge; do not use wildcard CORS.

Attach a persistent volume at `/data`. The OpenJarvis config, memory databases, traces, credentials and agent state live under `OPENJARVIS_HOME`; ephemeral storage is not acceptable for production.

## Required variables on the AFG AI web service

Set the same `OPENJARVIS_API_KEY` value as on the private service, and set:

- `OPENJARVIS_INTERNAL_URL`: the private Railway service URL, for example `http://<private-service-host>:8787`. Do not use a public URL if private networking is available.

Never put this secret in a `VITE_*` variable or browser code.

## Current integration boundary

AFG AI exposes authenticated routes:

- `GET /api/openjarvis/status`
- `GET /api/openjarvis/models`
- `POST /api/openjarvis/chat/completions` (streaming)

The browser never receives the internal API key. AFG AI authenticates the user and enforces CSRF on chat requests before proxying to OpenJarvis. Shell, code execution, browser automation, filesystem writes, connector actions and outbound channels are not exposed by this bridge.

**Important multi-user limitation:** the imported upstream server currently owns a single OpenJarvis runtime home. The bridge does not yet claim per-user isolation for OpenJarvis memory, traces, agent state, skills, connector credentials or schedules. Those features must remain unavailable to ordinary AFG users until tenant-scoped storage and permission enforcement are implemented. Do not put private user data into the shared OpenJarvis runtime.

## Model configuration

The OpenJarvis service discovers models from its own configured inference engines. AFG AI's database-managed provider keys are not automatically copied into the sidecar. Configure an OpenJarvis-supported engine and model explicitly; the model selector in AFG AI only shows models returned by the private OpenJarvis server.

## Deployment status

Adding this Dockerfile does not create a Railway service, attach a volume, configure secrets or deploy it. Create a separate Railway service from this repository using the Dockerfile path above, configure the private network and persistent volume, then set the two matching service variables. The main AFG AI service can continue running unchanged while the sidecar is brought online.
