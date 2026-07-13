#!/usr/bin/env bash
# Run ON Frankfurt ECS after reverse tunnel is active on 127.0.0.1:19080.
#
# Prereq (devbox): bash scripts/setup-collector-reverse-tunnel.sh
# Prereq (Frankfurt): scripts synced to /root/project or /root/
set -euo pipefail

ROOT="${TRIPNARA_ROOT:-/root/tripnara-collector}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${DIR}/vedur-collector-minimal.sh"
if [[ ! -f "$SCRIPT" ]]; then
  SCRIPT="${ROOT}/scripts/vedur-collector-minimal.sh"
fi
if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing vedur-collector-minimal.sh on Frankfurt host" >&2
  exit 1
fi

export TRIPNARA_INGEST_URL="${TRIPNARA_INGEST_URL:-http://127.0.0.1:19080/internal/evidence/weather/vedur}"
export TRIP_ID="${TRIP_ID:-a0a99999-9999-4999-8999-999999999999}"
export DAY_INDEX="${DAY_INDEX:-1}"

if [[ -z "${VEDUR_COLLECTOR_HMAC_SECRET:-}" ]]; then
  echo "Set VEDUR_COLLECTOR_HMAC_SECRET (must match devbox)" >&2
  exit 1
fi

echo "[e2e] probe tunnel health"
curl -4 -sS --connect-timeout 5 --max-time 10 "http://127.0.0.1:19080/health" || {
  echo "[e2e] tunnel not reachable — start devbox reverse tunnel first" >&2
  exit 1
}

echo "[e2e] run collector"
bash "$SCRIPT"
