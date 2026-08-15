#!/usr/bin/env bash
# Soft launch local: API + Expo web, health checks, friend URLs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$PATH"

API_PORT="${PORT:-3847}"
WEB_PORT="${WEB_PORT:-8081}"
export SOFT_LAUNCH="${SOFT_LAUNCH:-1}"
export HOST="${HOST:-0.0.0.0}"

LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
LAN="${LAN:-unknown}"

echo "→ Soft launch local (SOFT_LAUNCH=${SOFT_LAUNCH})"

# Free ports if previous session left zombies
lsof -ti:"$API_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:"$WEB_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 0.3

echo "→ API on :${API_PORT}"
cd "$ROOT/server"
SOFT_LAUNCH="$SOFT_LAUNCH" PORT="$API_PORT" HOST="$HOST" \
  node src/index.js > /tmp/paa-soft-api.log 2>&1 &
echo $! > /tmp/paa-soft-api.pid

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.4
done
if [[ "$ok" != "1" ]]; then
  echo "API failed to start. Log:"
  tail -30 /tmp/paa-soft-api.log
  exit 1
fi

META=$(curl -sf "http://127.0.0.1:${API_PORT}/meta")
echo "→ /meta softLaunch=$(echo "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("softLaunch"))' 2>/dev/null || echo '?')"

echo "→ Expo web on :${WEB_PORT}"
cd "$ROOT/mobile"
npx expo start --web --port "$WEB_PORT" > /tmp/paa-soft-expo.log 2>&1 &
echo $! > /tmp/paa-soft-expo.pid

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo ""
echo "========================================"
echo "  SOFT LAUNCH — LOCAL"
echo "  You:     http://127.0.0.1:${WEB_PORT}"
if [[ "$LAN" != "unknown" ]]; then
  echo "  Friends: http://${LAN}:${WEB_PORT}  (same Wi‑Fi)"
  echo "  API LAN: http://${LAN}:${API_PORT}/health"
fi
echo "  Happy path: START → fighter → JOIN A PIT"
echo "  Logs: /tmp/paa-soft-api.log  /tmp/paa-soft-expo.log"
echo "  Stop: kill \$(cat /tmp/paa-soft-api.pid) \$(cat /tmp/paa-soft-expo.pid)"
echo "  Docs: SOFT_LAUNCH.md"
echo "========================================"

# Open your browser (local only)
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${WEB_PORT}" 2>/dev/null || true
fi
