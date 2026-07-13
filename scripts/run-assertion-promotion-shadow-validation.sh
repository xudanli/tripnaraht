#!/usr/bin/env bash
# Full Assertion Promotion Shadow validation on devbox.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EVIDENCE_DIR="$ROOT/internal-docs/operations/evidence"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
LOG_PACK="$EVIDENCE_DIR/assertion-promotion-shadow-logs-${STAMP}.txt"
WEATHER_CANARY=a0a99999-9999-4999-8999-999999999999

mkdir -p "$EVIDENCE_DIR"
exec > >(tee -a "$LOG_PACK") 2>&1

echo "=== Assertion Promotion Shadow Validation $STAMP ==="
date -u

echo ""
echo "=== 1) Restart Nest :3002 ==="
bash "$ROOT/scripts/restart-nest-3002.sh"

echo ""
echo "=== 2) Restart collector :3000 (PM2) ==="
bash "$ROOT/scripts/install-devbox-collector-pm2.sh"

echo ""
echo "=== 3) Verify promotion endpoint (health + secret) ==="
curl -sf http://127.0.0.1:3002/health | head -c 200 || true
echo ""

echo ""
echo "=== 4) Baseline snapshot ==="
set -a && source "$ROOT/.env" && source "$ROOT/config/decision-runtime/assertion-promotion.env" && set +a
npx tsx -e "
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
(async()=>{
  const t=await prisma.trip.findUnique({where:{id:'$WEATHER_CANARY'},select:{metadata:true}});
  const m=(t?.metadata??{}) as Record<string,unknown>;
  const p=(m.rfc001DecisionProblems as {items?:unknown[]})?.items??[];
  const l=m.rfc001AssertionPromotionLedger??null;
  console.log(JSON.stringify({problemCount:p.length,ledger:l},null,2));
  await prisma.\$disconnect();
})();
" | tee "$EVIDENCE_DIR/assertion-promotion-shadow-baseline-${STAMP}.json"

echo ""
echo "=== 5) Wait for next Vedur cron (max 16m) ==="
BEFORE_LINES=$(wc -l < /home/devbox/.pm2/logs/vedur-collector-ingest-out.log 2>/dev/null || echo 0)
echo "ingest log lines before=$BEFORE_LINES"
DEADLINE=$(( $(date +%s) + 960 ))
NEW_INGEST=false
while [ $(date +%s) -lt $DEADLINE ]; do
  NOW_MIN=$(date -u +%M)
  LINES=$(wc -l < /home/devbox/.pm2/logs/vedur-collector-ingest-out.log 2>/dev/null || echo 0)
  if [ "$LINES" -gt "$BEFORE_LINES" ]; then
    TAIL=$(tail -3 /home/devbox/.pm2/logs/vedur-collector-ingest-out.log)
    echo "[poll] new ingest log lines=$LINES tail=$TAIL"
    if echo "$TAIL" | grep -q 'collector ingest stored'; then
      NEW_INGEST=true
      break
    fi
  fi
  if [ "$((NOW_MIN % 15))" -eq 2 ] || [ "$((NOW_MIN % 15))" -eq 3 ]; then
    sleep 30
  else
    sleep 15
  fi
done
echo "new_ingest_detected=$NEW_INGEST"
sleep 5

echo ""
echo "=== 6) Service interrupt + retry test ==="
echo "Stopping Nest briefly..."
pkill -f 'nest start --watch' 2>/dev/null || true
sleep 2
echo "Promote while Nest down (expect client failure)..."
curl -s --max-time 3 -X POST http://127.0.0.1:3002/api/internal/monitoring/promote-assertion \
  -H 'Content-Type: application/json' \
  -H "x-assertion-promotion-secret: ${ASSERTION_PROMOTION_INTERNAL_SECRET}" \
  -d '{"tripId":"'$WEATHER_CANARY'","signal":"RECOVERY_OBSERVED","predicate":"weather.hazard","dayIndex":1,"riskTier":"CALM","ingestId":"interrupt-down","trigger":"collector_ingest"}' \
  || echo "interrupt_down_expected_fail=true"
echo "Restarting Nest..."
bash "$ROOT/scripts/restart-nest-3002.sh"
sleep 3
echo "Promote after restart (expect success)..."
curl -s -X POST http://127.0.0.1:3002/api/internal/monitoring/promote-assertion \
  -H 'Content-Type: application/json' \
  -H "x-assertion-promotion-secret: ${ASSERTION_PROMOTION_INTERNAL_SECRET}" \
  -d '{"tripId":"'$WEATHER_CANARY'","signal":"RECOVERY_OBSERVED","predicate":"weather.hazard","dayIndex":1,"riskTier":"CALM","ingestId":"post-interrupt-'$(date +%s)'","trigger":"collector_ingest"}' \
  | tee "$EVIDENCE_DIR/assertion-promotion-post-interrupt-${STAMP}.json"
echo ""
echo "Monitoring scan reconcile fallback..."
curl -s -X POST "http://127.0.0.1:3002/api/trips/${WEATHER_CANARY}/monitoring/scan?dayIndex=1" \
  | head -c 500 || true
echo ""

echo ""
echo "=== 7) Structured tests (wrong secret, allowlist, duplicate, road) ==="
npx tsx "$ROOT/scripts/validate-assertion-promotion-shadow.ts" \
  | tee "$EVIDENCE_DIR/assertion-promotion-shadow-validation-run-${STAMP}.json"

echo ""
echo "=== 8) Final ledger + logs ==="
npx tsx -e "
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
(async()=>{
  const t=await prisma.trip.findUnique({where:{id:'$WEATHER_CANARY'},select:{metadata:true}});
  const m=(t?.metadata??{}) as Record<string,unknown>;
  console.log(JSON.stringify({
    problems:(m.rfc001DecisionProblems as {items?:unknown[]})?.items?.length??0,
    ledger:m.rfc001AssertionPromotionLedger??null,
  },null,2));
  await prisma.\$disconnect();
})();
" | tee "$EVIDENCE_DIR/assertion-promotion-shadow-final-ledger-${STAMP}.json"

echo "" >> "$LOG_PACK"
echo "=== PM2 ingest tail ===" >> "$LOG_PACK"
tail -30 /home/devbox/.pm2/logs/vedur-collector-ingest-out.log >> "$LOG_PACK" 2>/dev/null || true
echo "=== Nest tail ===" >> "$LOG_PACK"
tail -40 /tmp/nest3002-watch.log >> "$LOG_PACK" 2>/dev/null || true
echo "=== Promotion client warnings in ingest error log ===" >> "$LOG_PACK"
grep -i 'assertion-promotion' /home/devbox/.pm2/logs/vedur-collector-ingest-error.log 2>/dev/null | tail -20 >> "$LOG_PACK" || true

echo ""
echo "DONE log_pack=$LOG_PACK"
