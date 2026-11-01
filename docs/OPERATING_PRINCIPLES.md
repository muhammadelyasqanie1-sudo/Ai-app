# AFG AI — Operating Principles and Source Audit

## Non-negotiable rules

1. Inspect the existing code, routes, schema, environment contract, and deployment configuration before modifying anything.
2. Preserve working functionality and prefer focused refactors.
3. Do not ship simulated integrations. Disable unconfigured capabilities and explain why.
4. Keep credentials in server environment variables or secret stores; never hardcode them.
5. Redact secrets and private payloads from frontend output, logs, and error responses.
6. Enforce roles, ownership, quotas, and permissions on the server. Never trust client state for authorization.
7. Keep frontend API paths, backend routes, and model IDs identical across development and production.
8. Capability flags must reflect verified provider support.
9. Fail safely with structured errors, request IDs, bounded retries where appropriate, and preserved user input.
10. Do not run tests, builds, or deployments without explicit user approval. Source inspection and edits only.
11. Report changes, incomplete work, and required configuration honestly.
12. Keep the project deployable and document every required service or secret.

## Audit and changes in this pass

- Inspected the repository tree, primary React application, API handlers, database schema and connection helper, package scripts, environment sample, Vite config, Capacitor config, Android workflow, and Android build notes.
- Added `src/api/modelCatalog.ts` as the single live Cloudflare model discovery implementation. Express production and Vite development now share the same model IDs and verification rules.
- Model discovery returns verified only when at least one valid chat model is found. No hardcoded fallback model is used.
- Added allowlisted CORS support for configured origins and Capacitor localhost; request IDs are attached before API preflight responses.
- Removed raw upstream provider error bodies and database connection error details from logs. Chat errors shown in the UI are generic and safe.
- Disabled chat attachments until upload, storage, and model processing exist.
- Replaced fabricated admin metrics and client-only admin toggles with a disabled state. Removed false server-ready and notification indicators, fake sign-out, and the incorrect Premium guest label.
- Removed sample code output and fabricated document summaries. Translation, code generation, document processing, and file tools remain unavailable until real integrations exist.
- Removed fixed currency conversion rates. QR generation calls QRServer and discloses that submitted text is sent to that third party.
- Replaced the obsolete Gemini environment example with Cloudflare and PostgreSQL server-side variable names.
- Changed the Android APK workflow to manual dispatch only.

## Incomplete work and required configuration

- Chat requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the server secret store. Never put these in `VITE_*` variables.
- PostgreSQL schema and connection foundation exist, but authentication, migrations, persistent chat history, ownership checks, quotas, and user-data endpoints are not implemented. Do not run migrations as part of a source-only change.
- Google/email authentication and server-side admin authorization are not implemented; admin and sign-in/sign-out remain disabled.
- Image/video generation, translation, standalone code generation, PDF processing, file conversion, server-side transcription, and TTS are not connected.
- Chat is text-only. Browser speech recognition depends on device/browser support and is not a server transcription service.
- History is not persisted and remains empty rather than showing invented records.
- No Render Blueprint, Dockerfile, or deployment manifest exists in the repository. Render settings and auto-deploy behavior are external to source. The server start script is `tsx server.ts`; Render supplies `PORT`.
- The Android workflow accepts optional `api_base_url` at manual dispatch. An APK must target the deployed HTTPS API; an APK build does not deploy the backend.

Tests, lint, database migrations, and manual deployments were not initiated. Important exception: while the original workflow still had its `push` trigger, commits to `main` automatically triggered GitHub Actions APK builds. Runs #35–49 completed: 13 succeeded and 2 failed. The workflow is now manual-dispatch-only, so future pushes will not start APK builds. Render auto-deploy settings are external and must be checked in the Render dashboard; this repository cannot confirm whether those main-branch commits triggered a Render deployment.
