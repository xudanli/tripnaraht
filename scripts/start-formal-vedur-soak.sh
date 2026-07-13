#!/usr/bin/env bash
# One-shot: PM2 + Frankfurt cron + formal soak evidence.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1/3 Devbox PM2 persistence ==="
bash "$ROOT/scripts/install-devbox-collector-pm2.sh"

echo ""
echo "=== 2/3 Frankfurt cron (every 15 min) ==="
bash "$ROOT/scripts/install-frankfurt-collector-cron.sh"

echo ""
echo "=== 3/3 Formal Vedur soak start ==="
npx tsx "$ROOT/scripts/prod-canary-formal-vedur-soak-start.ts"
