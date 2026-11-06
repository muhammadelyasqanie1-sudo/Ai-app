#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/plugins/capacitor-offline-models/android/src/main/cpp/prebuilt/libneedle.a"
URL="https://huggingface.co/Cactus-Compute/needle3/resolve/main/android-arm64/libneedle.a"
EXPECTED_SHA256="7aa6de6132a22bf45f5e903425feb66f159ad46f47fa558921bc4fd02c3a2fa0"

mkdir -p "$(dirname "$DEST")"
curl --fail --location --silent --show-error \
  --retry 5 --retry-all-errors --retry-delay 2 \
  --connect-timeout 30 --max-time 180 \
  --user-agent "AFG-AI-Android-Build/1.0" \
  "$URL" --output "$DEST"

echo "$EXPECTED_SHA256  $DEST" | sha256sum --check --status || {
  echo "Needle 3 Android engine SHA-256 mismatch; refusing to build." >&2
  rm -f "$DEST"
  exit 1
}

echo "Verified Cactus Needle 3 Android ARM64 static library."
