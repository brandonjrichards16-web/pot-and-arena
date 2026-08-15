#!/bin/bash
# Hard-swap back to the known-good arts from before the "tighter cutout" pass.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BAK="$(cd "$(dirname "$0")" && pwd)"
rsync -a --delete "$BAK/heroes/" "$ROOT/heroes/"
rsync -a --delete "$BAK/sets/" "$ROOT/sets/"
if [ -d "$BAK/turns" ]; then rsync -a --delete "$BAK/turns/" "$ROOT/turns/"; fi
echo "Restored good arts from $BAK"
echo "Re-export web if needed: cd mobile && npx expo export --platform web && rm -rf ../server/public/* && cp -R dist/* ../server/public/"
