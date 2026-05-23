#!/usr/bin/env bash
# Bundle the extension into a .zip ready for AMO upload.
# Usage: ./scripts/build.sh

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if ! command -v zip >/dev/null 2>&1; then
  echo "error: 'zip' is required but not installed." >&2
  exit 1
fi

version=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' manifest.json \
          | head -n1 \
          | sed -E 's/.*"([^"]+)"$/\1/')

if [[ -z "${version}" ]]; then
  echo "error: could not read version from manifest.json" >&2
  exit 1
fi

mkdir -p dist
out="dist/loophole-for-pihole-${version}.zip"
rm -f "$out"

# Files & directories that ship with the extension.
zip -r "$out" \
  manifest.json \
  background.js \
  lib \
  popup \
  options \
  icons \
  _locales \
  -x "*/.DS_Store" "*/Thumbs.db" "*.swp"

echo "Built $out"

# Also produce a source-code zip for AMO's "Source code" question.
# Uses git archive so it matches exactly what is committed (no .DS_Store etc.).
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  src_out="dist/loophole-for-pihole-${version}-source.zip"
  rm -f "$src_out"
  git archive --format=zip --output="$src_out" HEAD
  echo "Built $src_out (for AMO source-code upload)"
fi

echo
echo "Next steps:"
echo "  1. Test locally:    web-ext run --source-dir ."
echo "  2. Lint:            web-ext lint --source-dir ."
echo "  3. Upload at:       https://addons.mozilla.org/developers/addon/submit/"
