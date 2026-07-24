#!/usr/bin/env bash
# Reverse SSH tunnel: expose devbox TripNARA ingest to Frankfurt collector.
#
# Run on DEVBOX (this machine):
#   bash scripts/setup-collector-reverse-tunnel.sh
#
# Then on Frankfurt ECS:
#   export TRIPNARA_INGEST_URL='http://127.0.0.1:19080/internal/evidence/weather/vedur'
#   bash scripts/vedur-collector-minimal.sh
set -euo pipefail

FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
REMOTE_BIND_PORT="${REMOTE_BIND_PORT:-19080}"
SSH_OPTS="${SSH_OPTS:--o ServerAliveInterval=30 -o ExitOnForwardFailure=yes}"

echo "=== Collector reverse tunnel ==="
echo "Frankfurt: $FRANKFURT_HOST"
echo "Local TripNARA: 127.0.0.1:$LOCAL_PORT"
echo "Remote bind:    127.0.0.1:$REMOTE_BIND_PORT (on Frankfurt)"
echo ""
echo "Prerequisites on devbox:"
echo "  - Nest running on port $LOCAL_PORT with VEDUR_COLLECTOR_INGEST_ENABLED=1"
echo "  - VEDUR_COLLECTOR_HMAC_SECRET shared with Frankfurt collector"
echo ""
echo "Starting tunnel (Ctrl+C to stop)..."
exec ssh -N $SSH_OPTS -R "${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_PORT}" "$FRANKFURT_HOST"
