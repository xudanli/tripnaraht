#!/usr/bin/env bash
# Restart PM2 collector with live canary promotion env.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
source "$ROOT/config/decision-runtime/vedur-collector-ingest.env"
source "$ROOT/config/decision-runtime/assertion-promotion-live.env"
set +a
exec bash "$ROOT/scripts/install-devbox-collector-pm2.sh"
