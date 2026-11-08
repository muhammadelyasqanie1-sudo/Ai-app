# Passive OSINT and evidence graph

Five references inform architecture: [OpenOSINT](https://github.com/OpenOSINT/OpenOSINT) (passive-by-default MCP policy), [OSINT-EYE](https://github.com/Ruby570bocadito/OSINT-EYE) (scope gates), [Link-Mage](https://github.com/pallab-js/link-mage) (typed graph/provenance), [OSINT Pivot Engine](https://github.com/Edi-San24/OSINT-Pivot-Engine) (indicator pivots), and [OSINT Explorer V2](https://github.com/halans/osint-explorer-v2) (curated links). No upstream source is vendored; the Explorer dataset (CC-BY-SA-4.0) is not redistributed.

## Capabilities
- Domain: public DNS A/AAAA/MX/NS/TXT via Cloudflare DNS-over-HTTPS, RDAP metadata, Certificate Transparency names from crt.sh.
- Public IP: RDAP allocation metadata.
- SHA-256: local format validation only; no upload or reputation verdict.
- Owner-scoped cases, evidence observations, typed entities and graph edges; exact source URLs and warnings are retained.
- 10 assessments/account/hour; fixed HTTPS sources; 10-second timeout and bounded responses.

## Safety
Domain/IP requires explicit UI confirmation; chat additionally requires ownership/authorization stated in the latest user message. Private, loopback, link-local, reserved and documentation IP ranges are rejected. No active scanning, brute force, exploitation, account/person/phone/face search, doxing or private-record scraping. RDAP contact data is not stored. Retrieved records are untrusted data.

## Operations
Apply `0053_passive_osint_cases.sql` after database backup using `npm run db:migrate`. The feature flag is seeded enabled. API: `GET /api/osint/status`, `GET /api/osint/cases`, `POST /api/osint/assess`, `GET/DELETE /api/osint/cases/:id`. The chat function is `afg_osint_passive_assess`. Public lookups require outbound HTTPS but no API keys.

## Offline
PWA shell cache is not the same as offline AI inference. Browser model downloads use OPFS/IndexedDB, byte-range resume and incremental SHA-256. Android uses DownloadManager and verifies size/hash when metadata supplies them. Offline chat needs a downloaded model and compatible local runtime. `npm run test:offline-download` uses deterministic mocked network/OPFS fixtures; it does not download multi-GB weights or replace physical Android airplane-mode testing.