#!/usr/bin/env bash
# Export Expo web into server/public for one-box hosting.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"
echo "→ expo export --platform web"
npx expo export --platform web --output-dir dist --clear
rm -rf "$ROOT/server/public"
mkdir -p "$ROOT/server/public"
cp -R dist/. "$ROOT/server/public/"
# Ensure SPA has index.html
if [[ ! -f "$ROOT/server/public/index.html" ]]; then
  echo "ERROR: no index.html in export" >&2
  exit 1
fi
echo "→ web client ready at server/public ($(du -sh "$ROOT/server/public" | awk '{print $1}'))"
