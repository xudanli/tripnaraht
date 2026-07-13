#!/usr/bin/env bash
# Run ON Frankfurt ECS after reverse tunnel is active on 127.0.0.1:19080.
#
# Prereq (devbox): bash scripts/setup-collector-reverse-tunnel.sh
set -euo pipefail

ROOT="${TRIPNARA_ROOT:-/root/tripnara-collector}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${DIR}/gagnaveita-collector-minimal.sh"
if [[ ! -f "$SCRIPT" ]]; then
  SCRIPT="${ROOT}/scripts/gagnaveita-collector-minimal.sh"
fi
if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing gagnaveita-collector-minimal.sh on Frankfurt host" >&2
  exit 1
fi

export TRIPNARA_INGEST_URL="${TRIPNARA_INGEST_URL:-http://127.0.0.1:19080/internal/evidence/road/gagnaveita}"
export TRIP_ID="${TRIP_ID:-a0a99999-9999-4999-8999-999999999999}"
export ROAD_ID="${ROAD_ID:-F208}"

if [[ -z "${GAGNAVEITA_COLLECTOR_HMAC_SECRET:-${VEDUR_COLLECTOR_HMAC_SECRET:-}}" ]]; then
  echo "Set GAGNAVEITA_COLLECTOR_HMAC_SECRET or VEDUR_COLLECTOR_HMAC_SECRET" >&2
  exit 1
fi

echo "[gagnaveita-e2e] probe tunnel health"
curl -4 -sS --connect-timeout 5 --max-time 10 "http://127.0.0.1:19080/health" || {
  echo "[gagnaveita-e2e] tunnel not reachable — start devbox reverse tunnel first" >&2
  exit 1
}

echo "[gagnaveita-e2e] run collector"
bash "$SCRIPT"
