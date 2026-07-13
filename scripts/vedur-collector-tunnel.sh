#!/usr/bin/env bash
# Keep reverse SSH tunnel alive (auto-reconnect).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
REMOTE_BIND_PORT="${REMOTE_BIND_PORT:-19080}"
LOG_DIR="${LOG_DIR:-/tmp/tripnara-collector-logs}"
mkdir -p "$LOG_DIR"

echo "[tunnel] starting loop → $FRANKFURT_HOST:$REMOTE_BIND_PORT"
while true; do
  date -u +"%Y-%m-%dT%H:%M:%SZ tunnel connect" >>"$LOG_DIR/collector-tunnel.log"
  ssh -N \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o BatchMode=yes \
    -R "${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_PORT}" \
    "$FRANKFURT_HOST" 2>>"$LOG_DIR/collector-tunnel.log" || true
  echo "[tunnel] disconnected — retry in 5s" | tee -a "$LOG_DIR/collector-tunnel.log"
  sleep 5
done
