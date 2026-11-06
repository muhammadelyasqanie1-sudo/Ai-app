#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/plugins/capacitor-offline-models/android/src/main/cpp/prebuilt/libneedle.a"
REVISION="d6c7d6a2e9655505e0f8e23339356dd1705900eb"
URL="https://huggingface.co/Cactus-Compute/needle3/resolve/$REVISION/android-arm64/libneedle.a"
EXPECTED_SHA256="7aa6de6132a22bf45f5e903425feb66f159ad46f47fa558921bc4fd02c3a2fa0"

mkdir -p "$(dirname "$DEST")"
rm -f "$DEST"

# First try the official Hugging Face CDN with redirect/retry support.
if ! curl --fail --location --silent --show-error \
  --retry 5 --retry-all-errors --retry-delay 2 \
  --connect-timeout 30 --max-time 180 \
  --user-agent "AFG-AI-Android-Build/1.0" \
  "$URL" --output "$DEST"; then
  rm -f "$DEST"
  echo "Direct Hugging Face download failed; trying the Hologram HF-compatible mirror."
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  python -m pip install --disable-pip-version-check --quiet 'huggingface_hub[hf_xet]>=0.34'
  HF_ENDPOINT="https://gethologram.ai" hf download Cactus-Compute/needle3 android-arm64/libneedle.a \
    --repo-type model --revision "$REVISION" --local-dir "$TMP_DIR" --quiet
  cp "$TMP_DIR/android-arm64/libneedle.a" "$DEST"
fi

echo "$EXPECTED_SHA256  $DEST" | sha256sum --check --status || {
  echo "Needle 3 Android engine SHA-256 mismatch; refusing to build." >&2
  rm -f "$DEST"
  exit 1
}

echo "Verified Cactus Needle 3 Android ARM64 static library."
