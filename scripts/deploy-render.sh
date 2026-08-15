#!/usr/bin/env bash
# Prep + guide for deploying Pot & Arena to Render free tier (no tunnel).
# Render builds from GitHub — this script rebuilds the web client and prints next steps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Building web client into server/public (required by Dockerfile)"
"$ROOT/scripts/build-web.sh"

if [[ ! -f "$ROOT/render.yaml" ]]; then
  echo "ERROR: render.yaml missing at repo root" >&2
  exit 1
fi

if [[ ! -f "$ROOT/server/public/index.html" ]]; then
  echo "ERROR: server/public/index.html missing after build" >&2
  exit 1
fi

echo ""
echo "→ Web build ready ($(du -sh server/public | awk '{print $1}'))"
echo ""

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "========================================"
  echo "  This folder is not a git repo yet."
  echo "  Render deploys from GitHub. One-time setup:"
  echo ""
  echo "  cd $ROOT"
  echo "  git init"
  echo "  git add -A"
  echo "  git commit -m \"Deploy Pot & Arena to Render\""
  echo "  # Create empty repo on GitHub, then:"
  echo "  git remote add origin git@github.com:YOUR_USER/pot-and-arena.git"
  echo "  git branch -M main"
  echo "  git push -u origin main"
  echo "========================================"
else
  echo "→ Git status (commit + push server/public + render.yaml before deploy):"
  git status -sb || true
  echo ""
  if git remote get-url origin >/dev/null 2>&1; then
    echo "  Remote: $(git remote get-url origin)"
    echo "  After commit:  git push"
  else
    echo "  No origin remote — add GitHub: git remote add origin <url> && git push -u origin main"
  fi
fi

echo ""
echo "========================================"
echo "  RENDER (free) — after code is on GitHub:"
echo ""
echo "  1. Open https://dashboard.render.com/"
echo "  2. New → Blueprint"
echo "  3. Connect the GitHub repo (root has render.yaml)"
echo "  4. Apply → wait for first deploy"
echo "  5. Open the service URL (*.onrender.com)"
echo ""
echo "  Free caveats:"
echo "  • First open after idle ~30–60s (cold start)"
echo "  • Progress may reset when the free instance sleeps/redeploys"
echo "  • Health: GET /health"
echo "========================================"
