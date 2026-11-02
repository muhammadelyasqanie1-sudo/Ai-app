# API application boundary

The current Express entry remains in root `server.ts` and API handlers in `src/api` for backwards-compatible deployment. Shared contracts and the single browser API client are being established before physically relocating the server. Provider credentials and adapters remain server-only.
