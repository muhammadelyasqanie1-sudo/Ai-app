#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREBUILT="$ROOT/plugins/capacitor-offline-models/android/src/main/cpp/prebuilt"
LIB="$PREBUILT/libneedle.a"
HEADER="$PREBUILT/needle.h"
REVISION="d6c7d6a2e9655505e0f8e23339356dd1705900eb"
BASE_URL="https://huggingface.co/Cactus-Compute/needle3/resolve/$REVISION/android-arm64"
EXPECTED_LIB_SHA256="7aa6de6132a22bf45f5e903425feb66f159ad46f47fa558921bc4fd02c3a2fa0"
EXPECTED_HEADER_SHA256="a27dac4b3239eead91d124b7f7dbce5495c13019903fd817b68c16d39b055a99"

mkdir -p "$PREBUILT"
rm -f "$LIB" "$HEADER"

# Try the official Hugging Face CDN first.
if ! curl --fail --location --silent --show-error \
  --retry 5 --retry-all-errors --retry-delay 2 \
  --connect-timeout 30 --max-time 180 \
  --user-agent "AFG-AI-Android-Build/1.0" \
  "$BASE_URL/libneedle.a" --output "$LIB" ||
  ! curl --fail --location --silent --show-error \
  --retry 5 --retry-all-errors --retry-delay 2 \
  --connect-timeout 30 --max-time 90 \
  --user-agent "AFG-AI-Android-Build/1.0" \
  "$BASE_URL/needle.h" --output "$HEADER"; then
  rm -f "$LIB" "$HEADER"
  echo "Direct Hugging Face download failed; trying the HF-compatible Hologram mirror."
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  python -m pip install --disable-pip-version-check --quiet 'huggingface_hub[hf_xet]>=0.34'
  HF_ENDPOINT="https://gethologram.ai" hf download Cactus-Compute/needle3 \
    android-arm64/libneedle.a android-arm64/needle.h \
    --repo-type model --revision "$REVISION" --local-dir "$TMP_DIR" --quiet
  cp "$TMP_DIR/android-arm64/libneedle.a" "$LIB"
  cp "$TMP_DIR/android-arm64/needle.h" "$HEADER"
fi

echo "$EXPECTED_LIB_SHA256  $LIB" | sha256sum --check --status || {
  echo "Needle 3 Android engine SHA-256 mismatch; refusing to build." >&2
  rm -f "$LIB" "$HEADER"
  exit 1
}
echo "$EXPECTED_HEADER_SHA256  $HEADER" | sha256sum --check --status || {
  echo "Needle 3 C API header SHA-256 mismatch; refusing to build." >&2
  rm -f "$LIB" "$HEADER"
  exit 1
}
echo "Verified Cactus Needle 3 Android ARM64 engine and header."
