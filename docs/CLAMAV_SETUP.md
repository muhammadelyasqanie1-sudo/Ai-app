# ClamAV Setup for the AFG AI Media Engine

The media engine is **fail-closed by design**: every upload lands in private
quarantine and stays there until a real `clamscan` run approves it. Nothing is
served to the user, the AI, or the provider integration before a scan verdict
exists. This document explains how to make that scanner available in every
supported environment, and what exactly happens where it is not available.

## How the fail-closed pipeline works

1. Upload → bytes written to the private quarantine directory
   (`AFG_UPLOAD_QUARANTINE_DIR`), row created with `status='quarantined'`.
   The API response states honestly: *"Stored privately in quarantine. It
   cannot be opened by AI until a security scanner approves it."*
2. Scan → `scanOwnedFile()` spawns the configured `clamscan` binary with
   conservative limits (`--max-filesize=16M --max-scansize=32M
   --max-files=100 --max-recursion=8 --alert-exceeds-max=yes`), feeds the file
   via stdin, and enforces a 30 s timeout plus a concurrency cap of 2 scans.
3. Verdict → exit code 0 approves (`status='approved'`), exit code 1 rejects
   (`status='rejected'`), any other exit, a crash, or a timeout leaves the file
   quarantined — **no approval is granted**.
4. Integrity → the status update is conditional on the stored `sha256`;
   a file that changed during the scan cannot be approved.
5. Audit → every scan verdict is recorded in `audit_logs`
   (`media.file.scanned`).

Configuration surface:

| Variable | Meaning |
|---|---|
| `AFG_CLAMSCAN_PATH` | Absolute path to the `clamscan` executable. Required for any approval to be possible. |
| `AFG_CLAMSCAN_DATABASE` | Optional absolute path to an additional signature database (e.g. a custom `.ndb`). |
| `AFG_UPLOAD_QUARANTINE_DIR` | Private quarantine directory (must not be web-servable). |

## Reproducible local setup

```bash
bash scripts/setup-clamav.sh          # install + freshclam + EICAR verification
bash scripts/setup-clamav.sh --check  # verify an existing installation only
```

The script detects apt/dnf/Homebrew, installs ClamAV, refreshes the signature
database, and ends by scanning the industry-standard EICAR test string —
so "installed" is verified with a real detection, not assumed.

Doctor / diagnostics at any time:

```bash
npx tsx scripts/check-clamav.ts
```

Exit codes: `0` scanner verified with a real detection; `1` not usable (the
message names the exact fix); the media-engine test suite
(`npm run test:media-engine`) additionally hard-asserts a working scanner and
fails closed where one is absent.

### Ubuntu / Debian (typical server)

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends clamav clamav-freshclam
sudo systemctl stop clamav-freshclam   # avoid DB lock contention with manual freshclam
sudo freshclam
export AFG_CLAMSCAN_PATH=/usr/bin/clamscan
```

### macOS (development)

```bash
brew install clamav
# Bootstrap the signature DB (Homebrew ships none):
mkdir -p "$(brew --prefix)/share/clamav"
freshclam --datadir="$(brew --prefix)/share/clamav"
export AFG_CLAMSCAN_PATH="$(brew --prefix)/bin/clamscan"
export AFG_CLAMSCAN_DATABASE="$(brew --prefix)/share/clamav"
```

### Docker-based deployments

The server needs to spawn a local `clamscan` binary; containers that run AFG AI
therefore include ClamAV in the image or mount a scanned sidecar. The
production Dockerfile pattern:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends clamav clamav-freshclam \
 && freshclam
ENV AFG_CLAMSCAN_PATH=/usr/bin/clamscan
```

### CI (already wired)

The `media-engine` GitHub Actions job provisions real ClamAV via apt
(`clamav` + `clamav-freshclam` + `freshclam`), sets
`AFG_CLAMSCAN_PATH=/usr/bin/clamscan`, and runs
`npm run test:media-engine` against a real PostgreSQL service. The suite uses
a synthetic signature database (`AFG.Test.Signature`) — it verifies the
integration end-to-end without claiming production malware coverage.

## Environments without ClamAV — precise behaviour

| Capability | Behaviour without ClamAV |
|---|---|
| File upload | Still works: bytes are stored in quarantine, `status='quarantined'`, honest message returned. |
| AI ingestion of uploads | Blocked (fail-closed). No approval path exists without a scanner verdict. |
| `GET /api/files/config` | Reports `scannerConfigured:false` and `scannerState:'requires_per_file_scan'` honestly. |
| Media tasks requiring files | Fail with the exact message: *"Configure AFG_CLAMSCAN_PATH to an absolute ClamAV clamscan executable; uploads remain quarantined."* |
| Provider/media output storage | Unaffected where no scan is required; stored output never bypasses scanning rules. |
| `npm run test:media-engine` locally | Fails with the exact setup message (by design). It passes in the CI `media-engine` job where ClamAV is provisioned. |

This asymmetry is intentional: a missing scanner degrades capability, never
security. Under no circumstances does the server mark an unscanned file as
approved or claim a scan happened.

## Sandbox note (current development environment)

This sandbox cannot install system packages user-space (no root), so
`npm run test:media-engine` cannot run here; it is verified in the CI job
above. All other suites (provider smoke, multi-instance fan-out, chat
persistence, agent engine, boot test) run here with the disposable PostgreSQL
cluster documented in `scripts/run-integration-tests.sh`.
