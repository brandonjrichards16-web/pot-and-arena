#!/usr/bin/env bash
# Deploy Pot & Arena to Fly.io free tier (API + web, same origin — NOT a tunnel).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.fly/bin:${PATH}"

if ! command -v fly >/dev/null 2>&1 && ! command -v flyctl >/dev/null 2>&1; then
  echo "Installing flyctl…"
  curl -L https://fly.io/install.sh | sh
  export PATH="${HOME}/.fly/bin:${PATH}"
fi
FLY="$(command -v fly || command -v flyctl)"

if ! "$FLY" auth whoami >/dev/null 2>&1; then
  echo "→ Log into Fly (browser will open). Free account, no card needed for free allowance."
  "$FLY" auth login
fi

echo "→ Building web client into server/public"
"$ROOT/scripts/build-web.sh"

cd "$ROOT"
APP="$("$FLY" apps list --json 2>/dev/null | python3 -c 'import sys,json; apps=json.load(sys.stdin); print(next((a["Name"] for a in apps if a["Name"].startswith("pot-and-arena")), ""))' 2>/dev/null || true)"
if [[ -z "${APP}" ]]; then
  # Create app from fly.toml name, or generate if taken
  if ! "$FLY" apps create pot-and-arena --org personal 2>/dev/null; then
    APP="$("$FLY" apps create pot-and-arena --generate-name --org personal --json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("Name",""))' || true)"
    if [[ -z "${APP}" ]]; then
      # Fallback: launch will create
      APP="pot-and-arena"
    fi
  else
    APP="pot-and-arena"
  fi
fi

echo "→ Deploying app: ${APP}"
# Ensure fly.toml app name matches
if grep -q "app = " fly.toml; then
  # macOS sed
  sed -i.bak "s/^app = .*/app = '${APP}'/" fly.toml && rm -f fly.toml.bak
fi

"$FLY" deploy --remote-only --ha=false -a "$APP"

URL="$("$FLY" status -a "$APP" --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("Hostname") or d.get("Hostname") or "")' 2>/dev/null || true)"
if [[ -z "$URL" ]]; then
  URL="${APP}.fly.dev"
fi
echo ""
echo "========================================"
echo "  PLAY:  https://${URL#https://}"
echo "  Share that link — nothing runs on your Mac."
echo "  First open after idle may take ~15–30s (free cold start)."
echo "========================================"
