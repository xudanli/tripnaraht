#!/usr/bin/env bash
# Install PM2 persistence for Vedur collector stack on devbox.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Stop ad-hoc processes from manual stack start (avoid port conflicts)
pkill -f 'vedur-collector-ingest-server.ts' 2>/dev/null || true
pkill -f 'ssh -N.*19080:127.0.0.1:3000' 2>/dev/null || true
sleep 1

# Load env into PM2 via dotenv-cli or export before start
set -a
# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/vedur-collector-ingest.env" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/assertion-promotion.env" 2>/dev/null || true
set +a

export VEDUR_COLLECTOR_INGEST_ENABLED="${VEDUR_COLLECTOR_INGEST_ENABLED:-1}"
export VEDUR_COLLECTOR_INGEST_CANONICAL="${VEDUR_COLLECTOR_INGEST_CANONICAL:-1}"

if [[ -z "${VEDUR_COLLECTOR_HMAC_SECRET:-}" ]]; then
  echo "VEDUR_COLLECTOR_HMAC_SECRET unset in .env" >&2
  exit 1
fi

pm2 delete vedur-collector-ingest vedur-collector-tunnel 2>/dev/null || true
pm2 start ecosystem.vedur-collector.config.js --update-env
pm2 save

echo "[pm2] vedur collector stack installed"
pm2 list | grep -E 'vedur-collector|name' || pm2 list

sleep 3
bash "$ROOT/scripts/start-collector-stack.sh" status
