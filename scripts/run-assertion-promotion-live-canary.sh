#!/usr/bin/env bash
# Limited Live Canary: lifecycle + retry + rollback validation.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
EVIDENCE=internal-docs/operations/evidence
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
LOG="$EVIDENCE/assertion-promotion-live-canary-logs-${STAMP}.txt"
mkdir -p "$EVIDENCE"
exec > >(tee -a "$LOG") 2>&1

echo "=== Weather Limited Live Canary $STAMP ==="
export DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
source "$ROOT/config/decision-runtime/vedur-collector-ingest.env"

echo "=== 1) Start Nest :3002 LIVE (SHADOW_MODE=0) ==="
bash "$ROOT/scripts/start-nest-3002-live-canary.sh"
sleep 2

echo "=== 2) Restart collector :3000 with live env ==="
bash "$ROOT/scripts/install-devbox-collector-live-canary-pm2.sh" 2>&1 | tail -8

echo "=== 3) Lifecycle drill (day 1) ==="
npx tsx "$ROOT/scripts/run-assertion-promotion-live-canary-drill.ts" --phase=lifecycle

echo "=== 4) Retry drill (day 9, fail-once) ==="
bash "$ROOT/scripts/start-nest-3002-live-retry-drill.sh"
ASSERTION_PROMOTION_TEST_FAIL_ONCE=1 npx tsx "$ROOT/scripts/run-assertion-promotion-live-canary-drill.ts" --phase=retry

echo "=== 5) Rollback to SHADOW_MODE=1 ==="
bash "$ROOT/scripts/start-nest-3002-prod.sh" 2>&1 | tail -3
bash "$ROOT/scripts/install-devbox-collector-pm2.sh" 2>&1 | tail -5

BEFORE_OPEN=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p=new PrismaClient();
(async()=>{
  const t=await p.trip.findUnique({where:{id:'a0a99999-9999-4999-8999-999999999999'},select:{metadata:true}});
  const items=((t?.metadata as any)?.rfc001DecisionProblems?.items??[]) as {status:string}[];
  console.log(items.filter(x=>x.status==='OPEN').length);
  await p.\$disconnect();
})();
")
echo "open_problems_after_rollback=$BEFORE_OPEN"

echo "=== DONE log=$LOG"
