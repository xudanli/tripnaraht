#!/usr/bin/env bash
# Road.is Egress Feasibility Spike — bash-only (Frankfurt / any ECS)
# Usage: bash scripts/road-is-egress-probe.sh [candidate]
set -euo pipefail

CANDIDATE="${1:-de-frankfurt}"
ROAD_ID="${ROAD_IS_PROBE_ROAD:-F208}"
OUT="/tmp/road-is-spike-${CANDIDATE}-$(date +%F).json"
SAMPLE="/tmp/road-is-${ROAD_ID}-${CANDIDATE}.json"
GAGNA_SAMPLE="/tmp/gagnaveita-faerd-${CANDIDATE}.json"

EGRESS=$(curl -4 -sS --connect-timeout 8 --max-time 12 https://api.ipify.org 2>/dev/null || echo unknown)
DNS_API=$(getent hosts api.road.is 2>/dev/null | awk '{print $1}' | head -1 || echo fail)
DNS_GAGNA=$(getent hosts gagnaveita.vegagerdin.is 2>/dev/null | awk '{print $1}' | head -1 || echo fail)
TCP_OK=0
HTTP_OK=0
GAGNA_OK=0

echo "=== Road.is Egress Spike (candidate=$CANDIDATE road=$ROAD_ID) ==="
echo "[INFO] egress-ip: $EGRESS"
echo "[INFO] dns-api.road.is: $DNS_API"
echo "[INFO] dns-gagnaveita: $DNS_GAGNA"

if timeout 12 bash -c 'echo | nc -w10 api.road.is 443' 2>/dev/null; then
  echo "[PASS] tcp-443-api"
  TCP_OK=1
else
  echo "[FAIL] tcp-443-api"
fi

HTTP_CODE=$(curl -4 -sS -o "$SAMPLE" -w '%{http_code}' \
  --connect-timeout 15 --max-time 35 \
  "https://api.road.is/api/condition?road=${ROAD_ID}" 2>/dev/null || echo "000")
BYTES=0
[[ -f "$SAMPLE" ]] && BYTES=$(wc -c < "$SAMPLE" 2>/dev/null || echo 0)
if [[ "$HTTP_CODE" == "200" ]] && [[ "$BYTES" -gt 50 ]] && grep -q '"results"' "$SAMPLE" 2>/dev/null; then
  echo "[PASS] http-api-condition: code=$HTTP_CODE bytes=$BYTES"
  HTTP_OK=1
else
  echo "[FAIL] http-api-condition: code=$HTTP_CODE bytes=$BYTES"
fi

GAGNA_CODE=$(curl -4 -sS -o "$GAGNA_SAMPLE" -w '%{http_code}' \
  --connect-timeout 15 --max-time 35 \
  'https://gagnaveita.vegagerdin.is/api/faerd2017_1' 2>/dev/null || echo "000")
GAGNA_BYTES=0
[[ -f "$GAGNA_SAMPLE" ]] && GAGNA_BYTES=$(wc -c < "$GAGNA_SAMPLE" 2>/dev/null || echo 0)
if [[ "$GAGNA_CODE" == "200" ]] && [[ "$GAGNA_BYTES" -gt 100 ]]; then
  echo "[PASS] http-gagnaveita-faerd: code=$GAGNA_CODE bytes=$GAGNA_BYTES"
  GAGNA_OK=1
else
  echo "[FAIL] http-gagnaveita-faerd: code=$GAGNA_CODE bytes=$GAGNA_BYTES"
fi

PARSED="parse_fail"
if [[ "$HTTP_OK" -eq 1 ]]; then
  PARSED=$(python3 -c "
import json
d=json.load(open('$SAMPLE'))
r=d.get('results',[{}])[0]
print(r.get('road_number','?'), r.get('status','?'))
" 2>/dev/null || echo parse_fail)
fi

if [[ "$TCP_OK" -eq 1 && "$HTTP_OK" -eq 1 ]]; then
  VERDICT=SPIKE_PASS
  EXIT=0
else
  VERDICT=SPIKE_FAIL
  EXIT=1
fi

{
  echo "{"
  echo "  \"evidenceType\": \"ROAD_IS_EGRESS_INVESTIGATION\","
  echo "  \"probedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"collectorCandidate\": \"$CANDIDATE\","
  echo "  \"collectorEgressIp\": \"$EGRESS\","
  echo "  \"dnsApiRoadIs\": \"$DNS_API\","
  echo "  \"dnsGagnaveita\": \"$DNS_GAGNA\","
  echo "  \"tcp443Pass\": $([[ $TCP_OK -eq 1 ]] && echo true || echo false),"
  echo "  \"httpApiPass\": $([[ $HTTP_OK -eq 1 ]] && echo true || echo false),"
  echo "  \"httpGagnaveitaPass\": $([[ $GAGNA_OK -eq 1 ]] && echo true || echo false),"
  echo "  \"verdict\": \"$VERDICT\","
  echo "  \"canaryRoadId\": \"$ROAD_ID\","
  echo "  \"f208Sample\": \"$PARSED\","
  echo "  \"samplePath\": \"$SAMPLE\","
  echo "  \"recommendedPath\": \"$([[ $VERDICT == SPIKE_PASS ]] && echo 'ROAD_IS_LIVE direct poll' || echo 'REPLAY_ONLY or collector spike')\""
  echo "}"
} > "$OUT"

echo ""
echo "=== $VERDICT ==="
cat "$OUT"
exit $EXIT
