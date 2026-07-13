#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pkill -f 'dist/src/main.js' 2>/dev/null || true
sleep 2
export DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
export PORT=3002
export DISABLE_REDIS=true
set -a
source "$ROOT/config/decision-runtime/assertion-promotion-live.env"
source "$ROOT/config/decision-runtime/assertion-promotion-drill.env"
export ASSERTION_PROMOTION_SHADOW_MODE=0
export ASSERTION_PROMOTION_TEST_FAIL_ONCE=1
set +a
export CANONICAL_WEATHER_ACTIVITY_PROHIBITED=1
export DECISION_GATEWAY_UNIFIED=1
export DECISION_TRIGGER_GATEWAY_ENABLED=1
nohup node "$ROOT/dist/src/main.js" >/tmp/nest3002-prod.log 2>&1 &
for i in $(seq 1 30); do curl -sf http://127.0.0.1:3002/health >/dev/null && echo ok && exit 0; sleep 2; done
exit 1
