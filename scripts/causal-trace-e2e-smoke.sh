#!/usr/bin/env bash
# Canonical Causal Trace v1 — live smoke (calibration + persistence check)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000/api}"
TRIP="${TRIP_ID:-1ae5cd8b-84ba-457d-9e0b-50ac3813a104}"
ACK='我确认在了解阻断原因后仍执行该方案'

enc() { python3 -c "import urllib.parse; print(urllib.parse.quote('$1', safe=''))"; }

echo "== 1. Pick open travel problem =="
PROB=$(curl -sf "$BASE/trips/$TRIP/decision-problems" | jq -r '.data.items[] | select(.causalTraceRef != null) | .problemId' | head -1)
if [ -z "$PROB" ] || [ "$PROB" = "null" ]; then
  echo "No problem with causalTraceRef on trip $TRIP" >&2
  exit 1
fi
ENC_PROB=$(enc "$PROB")
echo "problemId=$PROB"

echo "== 2. Preview + submit + apply =="
ACTION=$(curl -sf "$BASE/trips/$TRIP/decision-problems/$ENC_PROB" | jq -r '.data.actions[0].actionId')
TRACE=$(curl -sf -X POST "$BASE/trips/$TRIP/decision-problems/$ENC_PROB/options/$ACTION/preview" | jq -c '.data.causalTraceRef')
KEY="causal-smoke-$(date +%s)"

curl -sf -X POST "$BASE/trips/$TRIP/decision-problems/$ENC_PROB/resolutions" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg a "$ACTION" --argjson t "$TRACE" --arg ack "$ACK" --arg k "$KEY" \
    '{selectedActionId:$a, causalTraceRef:$t, idempotencyKey:$k, acknowledgement:[$ack]}')" \
  | jq '{resolutionId: .data.resolution.resolutionId, traceId: .data.causalTraceRef.traceId}'

APPLY=$(curl -sf -X POST "$BASE/trips/$TRIP/decision-problems/$ENC_PROB/apply")
echo "$APPLY" | jq '{revalidation: .data.revalidation, applyStatus: .data.applyResult.status, decisionId: .data.legacyDecision.decisionId}'

DECISION_ID=$(echo "$APPLY" | jq -r '.data.legacyDecision.decisionId // empty')
if [ -n "$DECISION_ID" ]; then
  echo "== 3. Outcome validation (DRIVING_DURATION) =="
  curl -sf "$BASE/trips/$TRIP/decisions/$DECISION_ID/validation" \
    | jq '{verdict: .data.verdict, driving: (.data.observedOutcomes[]? | select(.metric=="DRIVING_DURATION"))}'
fi

echo "== 4. Causal trace replay =="
REPLAY=$(curl -sf "$BASE/trips/$TRIP/decision-problems/$ENC_PROB/causal-trace")
echo "$REPLAY" | jq '{
  traceId: .data.ref.traceId,
  status: .data.trace.status,
  calibration: .data.trace.calibration,
  outcomeTitle: (.data.causalStoryView.chain[]? | select(.type=="OUTCOME") | .title)
}'

TRACE_ID=$(echo "$REPLAY" | jq -r '.data.ref.traceId')
STATUS=$(echo "$REPLAY" | jq -r '.data.trace.status')
if [ "$STATUS" != "CALIBRATED" ] && [ "$STATUS" != "EXECUTED" ]; then
  echo "WARN: expected CALIBRATED or EXECUTED, got $STATUS (revalidation may still be PENDING)" >&2
fi

echo "== 5. Persistence metadata (requires DATABASE_URL) =="
if command -v npx >/dev/null && [ -n "${DATABASE_URL:-}" ]; then
  npx ts-node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.trip.findUnique({ where: { id: '$TRIP' }, select: { metadata: true } })
      .then(t => {
        const block = t?.metadata?.canonicalCausalTracesV1;
        const hit = block?.traces?.some(tr => tr.traceId === '$TRACE_ID');
        console.log(JSON.stringify({ persisted: !!hit, traceCount: block?.traces?.length ?? 0 }));
        if (!hit) process.exit(1);
      })
      .finally(() => p.\$disconnect());
  "
else
  echo "SKIP metadata check (set DATABASE_URL to enable)"
fi

echo "SMOKE OK traceId=$TRACE_ID status=$STATUS"
