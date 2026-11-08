

## Passive OSINT evidence graph

Migration `0053_passive_osint_cases.sql` adds owner-scoped cases, entities, observations and graph edges, enables backend-only RLS and seeds the `osint` feature flag. Back up the database before applying with `npm run db:migrate`. All API queries are owner-scoped; no client-side or anonymous policy is added.
