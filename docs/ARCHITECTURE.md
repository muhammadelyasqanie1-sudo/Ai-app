# AFG AI architecture and migration map

## Current runtime
- Browser: Vite + React 19, rooted at repository root; UI under `src/components`.
- API: Express entry `server.ts`; single request router `src/api/http.ts`.
- Provider adapters: `src/providers`; discovery, health, fallback and model selection in `src/services/providerGateway.ts`.
- Persistence: PostgreSQL; canonical schema and migrations in `database/`.
- i18n: dictionaries and strict locale formatting in `src/utils`.

## Target workspace boundaries
- `apps/web`: browser app.
- `apps/api`: server and API handlers.
- `packages/shared`: Zod contracts, shared types, constants and model IDs.
- `packages/providers`: provider adapter public boundary.
- `packages/i18n`: locale dictionaries and loader public boundary.
- `packages/ui`: design-system public boundary.
- `db`: canonical migrations and seeds after migration-runner relocation.

Package entry points are compatibility facades. They re-export the existing implementations so there is one implementation, not duplicated providers, dictionaries or UI components. Current Vite/Express and Capacitor paths remain unchanged until a dedicated workspace migration updates build, deployment and Android paths together.

## End-to-end contracts
- `packages/shared/src/schemas.ts` is the shared Zod source for chat request validation.
- `src/lib/apiClient.ts` is the browser HTTP transport and validates chat payloads against that shared schema.
- `src/api/http.ts` remains the single server router.
- `src/lib/apiErrors.ts` normalizes browser-facing HTTP/API errors.
- `packages/shared/src/modelIds.ts` owns canonical `provider::model` ID formatting/parsing.
- `src/services/providerGateway.ts` is the one dynamic model registry and source of live provider/model availability.

## Conventions
1. Share request/response schemas from `packages/shared` between browser and API.
2. All new browser HTTP calls go through `src/lib/apiClient.ts`.
3. Normalize client errors through `src/lib/apiErrors.ts`; never expose upstream bodies or stack traces.
4. Use `createModelId` / `parseModelId` for model IDs.
5. Register each provider adapter once in `providerGateway.ts`.
6. Keep provider credentials and adapters server-only.
7. Keep migrations in one canonical directory.

## Physical migration plan
The source remains compatible with current Render/Vite and Capacitor deployment. Physical moves are deferred until workspace-aware scripts, Vite aliases, TypeScript configuration, Render commands and Capacitor `webDir` are updated atomically. This avoids breaking a deployment with half-moved paths.
