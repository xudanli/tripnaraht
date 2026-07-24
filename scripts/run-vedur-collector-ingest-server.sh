#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/vedur-collector-ingest.env" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/gagnaveita-collector-ingest.env" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/config/decision-runtime/assertion-promotion.env" 2>/dev/null || true
set +a
export VEDUR_COLLECTOR_INGEST_ENABLED="${VEDUR_COLLECTOR_INGEST_ENABLED:-1}"
export VEDUR_COLLECTOR_INGEST_CANONICAL="${VEDUR_COLLECTOR_INGEST_CANONICAL:-1}"
export GAGNAVEITA_COLLECTOR_INGEST_ENABLED="${GAGNAVEITA_COLLECTOR_INGEST_ENABLED:-1}"
export GAGNAVEITA_COLLECTOR_INGEST_CANONICAL="${GAGNAVEITA_COLLECTOR_INGEST_CANONICAL:-1}"
export PORT="${PORT:-3000}"
exec npx tsx scripts/vedur-collector-ingest-server.ts
