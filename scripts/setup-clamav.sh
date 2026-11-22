#!/usr/bin/env bash
# Reproducible local ClamAV setup for the AFG AI media engine.
#
# The media engine is fail-closed: uploads stay quarantined until a real
# clamscan approves them. This script installs ClamAV, bootstraps the signature
# database, and verifies the exact binary path the server expects.
#
# Usage:
#   bash scripts/setup-clamav.sh            # detect package manager and install
#   bash scripts/setup-clamav.sh --check    # only verify the current setup
#
# After a successful run, point the server at the printed path:
#   AFG_CLAMSCAN_PATH=/usr/bin/clamscan    (Linux, typical)
#   AFG_CLAMSCAN_PATH=/opt/homebrew/bin/clamscan (Apple Silicon, typical)
# Optional: AFG_CLAMSCAN_DATABASE=/absolute/path/to/custom.ndb
set -euo pipefail

CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

find_clamscan() {
  for candidate in /usr/bin/clamscan /usr/local/bin/clamscan /opt/homebrew/bin/clamscan; do
    [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  command -v clamscan || true
}

CLAMSCAN="$(find_clamscan || true)"

if $CHECK_ONLY; then
  if [ -z "$CLAMSCAN" ]; then
    echo "FAIL no clamscan executable found. Run: bash scripts/setup-clamav.sh" >&2
    exit 1
  fi
else
  if [ -z "$CLAMSCAN" ]; then
    echo "No clamscan found; installing..."
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq
      sudo apt-get install -y --no-install-recommends clamav clamav-freshclam
      # Stop the background updater so a manual freshclam below owns the DB lock.
      sudo systemctl stop clamav-freshclam 2>/dev/null || true
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y clamav clamav-update
    elif command -v brew >/dev/null 2>&1; then
      brew install clamav
      # Homebrew ships no signature DB; bootstrap one in the default location.
      PREFIX="$(brew --prefix)"
      if [ ! -f "$PREFIX/share/clamav/main.cvd" ] && [ ! -f "$PREFIX/share/clamav/main.cld" ]; then
        sudo mkdir -p "$PREFIX/share/clamav"
        sudo freshclam --config-file="$PREFIX/etc/clamav/freshclam.conf" --datadir="$PREFIX/share/clamav" || \
          freshclam --datadir="$PREFIX/share/clamav"
      fi
    elif command -v docker >/dev/null 2>&1; then
      echo "No native package manager option found; ClamAV via Docker (clamav/clamav) is documented in docs/CLAMAV_SETUP.md." >&2
      echo "The server requires a local clamscan binary; use the Docker daemon path documented there." >&2
      exit 1
    else
      echo "FAIL no supported package manager (apt/dnf/brew) found. See docs/CLAMAV_SETUP.md." >&2
      exit 1
    fi
    CLAMSCAN="$(find_clamscan || true)"
  fi
  if [ -z "$CLAMSCAN" ]; then
    echo "FAIL clamscan is still not available after installation." >&2
    exit 1
  fi
  # Bootstrap/refresh the signature database (needed for real detection).
  echo "Refreshing signature database (freshclam)..."
  if sudo -n true 2>/dev/null; then sudo freshclam --quiet || sudo freshclam; else freshclam --quiet || freshclam || true; fi
fi

echo "clamscan: $CLAMSCAN"
"$CLAMSCAN" --version || true

# End-to-end verification with the EICAR test string (industry-standard,
# harmless test file that every working scanner detects).
TMPDIR_EICAR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_EICAR"' EXIT
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "$TMPDIR_EICAR/eicar.txt"
if "$CLAMSCAN" --no-summary "$TMPDIR_EICAR/eicar.txt" | grep -qi "EICAR"; then
  echo "PASS clamscan detected the EICAR test file; the media engine can rely on this scanner."
  echo
  echo "Server configuration:"
  echo "  AFG_CLAMSCAN_PATH=$CLAMSCAN"
  [ -n "${AFG_CLAMSCAN_DATABASE:-}" ] && echo "  AFG_CLAMSCAN_DATABASE=$AFG_CLAMSCAN_DATABASE"
else
  echo "WARN clamscan ran but did not detect the EICAR test file." >&2
  echo "     The signature database may be missing or stale; run: sudo freshclam" >&2
  exit 2
fi
