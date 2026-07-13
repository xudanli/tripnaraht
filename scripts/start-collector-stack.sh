#!/usr/bin/env bash
# Start Vedur collector stack on devbox: ingest server + reverse SSH tunnel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
REMOTE_BIND_PORT="${REMOTE_BIND_PORT:-19080}"
PID_DIR="${PID_DIR:-/tmp/tripnara-collector-pids}"
LOG_DIR="${LOG_DIR:-/tmp/tripnara-collector-logs}"

mkdir -p "$PID_DIR" "$LOG_DIR"

load_env() {
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" 2>/dev/null || true
  # shellcheck disable=SC1091
  source "$ROOT/config/decision-runtime/vedur-collector-ingest.env" 2>/dev/null || true
  set +a
}

start_ingest_server() {
  if curl -4 -sS --max-time 2 "http://127.0.0.1:${LOCAL_PORT}/health" >/dev/null 2>&1; then
    echo "[stack] ingest server already up on :${LOCAL_PORT}"
    return 0
  fi
  echo "[stack] starting ingest server on :${LOCAL_PORT}"
  load_env
  nohup npx tsx scripts/vedur-collector-ingest-server.ts \
    >"$LOG_DIR/vedur-ingest-server.log" 2>&1 &
  echo $! >"$PID_DIR/vedur-ingest-server.pid"
  for _ in $(seq 1 20); do
    if curl -4 -sS --max-time 2 "http://127.0.0.1:${LOCAL_PORT}/health" >/dev/null 2>&1; then
      echo "[stack] ingest server ready"
      return 0
    fi
    sleep 0.5
  done
  echo "[stack] ingest server failed to start — see $LOG_DIR/vedur-ingest-server.log" >&2
  return 1
}

start_tunnel() {
  if pgrep -f "ssh -N.*${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_PORT}.*${FRANKFURT_HOST#*@}" >/dev/null 2>&1; then
    echo "[stack] reverse tunnel already running"
    return 0
  fi
  if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$FRANKFURT_HOST" 'echo ok' >/dev/null 2>&1; then
    echo "[stack] SSH to $FRANKFURT_HOST not authorized — run:" >&2
    bash "$ROOT/scripts/bootstrap-frankfurt-ssh-access.sh"
    return 1
  fi
  echo "[stack] starting reverse tunnel → $FRANKFURT_HOST:$REMOTE_BIND_PORT"
  nohup ssh -N \
    -o ServerAliveInterval=30 \
    -o ExitOnForwardFailure=yes \
    -R "${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_PORT}" \
    "$FRANKFURT_HOST" >"$LOG_DIR/collector-tunnel.log" 2>&1 &
  echo $! >"$PID_DIR/collector-tunnel.pid"
  sleep 1
  if ssh -o BatchMode=yes "$FRANKFURT_HOST" "curl -4 -sS --max-time 5 http://127.0.0.1:${REMOTE_BIND_PORT}/health" >/dev/null 2>&1; then
    echo "[stack] tunnel verified from Frankfurt"
    return 0
  fi
  echo "[stack] tunnel started but health check from Frankfurt failed — check GatewayPorts on ECS" >&2
  return 1
}

write_frankfurt_runtime_env() {
  load_env
  local out="$ROOT/config/decision-runtime/vedur-collector-frankfurt.runtime.env"
  cat >"$out" <<EOF
# Copy to Frankfurt: /root/vedur-collector.runtime.env
VEDUR_COLLECTOR_HMAC_SECRET=${VEDUR_COLLECTOR_HMAC_SECRET}
TRIPNARA_INGEST_URL=http://127.0.0.1:${REMOTE_BIND_PORT}/internal/evidence/weather/vedur
TRIP_ID=a0a99999-9999-4999-8999-999999999999
DAY_INDEX=1
COLLECTOR_ID=vedur-collector-pilot
COLLECTOR_REGION=eu-central-1-frankfurt
EOF
  chmod 600 "$out"
  echo "[stack] wrote $out"
}

case "${1:-all}" in
  server) start_ingest_server ;;
  tunnel) start_tunnel ;;
  env) write_frankfurt_runtime_env ;;
  all)
    start_ingest_server
    write_frankfurt_runtime_env
    start_tunnel || true
    ;;
  status)
    curl -4 -sS "http://127.0.0.1:${LOCAL_PORT}/health" || echo "ingest: down"
    ssh -o BatchMode=yes -o ConnectTimeout=5 "$FRANKFURT_HOST" \
      "curl -4 -sS --max-time 5 http://127.0.0.1:${REMOTE_BIND_PORT}/health" 2>/dev/null || echo "tunnel: down or ssh blocked"
    ;;
  *)
    echo "Usage: $0 {all|server|tunnel|env|status}" >&2
    exit 1
    ;;
esac
