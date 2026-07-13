#!/usr/bin/env bash
# Vedur Collector Feasibility Spike — bash-only (Ubuntu fresh install)
# Usage: bash vedur-collector-feasibility-spike.sh de-frankfurt
set -uo pipefail

CANDIDATE="${1:-de-frankfurt}"
VEDUR_URL='https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&ids=1'
OUT="/tmp/vedur-spike-${CANDIDATE}-$(date +%F).json"

TCP_OK=0
HTTP_OK=1
EGRESS="unknown"
DNS="unknown"
SAMPLE_FILE="/tmp/vedur-sample.xml"

echo "=== Vedur Collector Feasibility Spike (candidate=$CANDIDATE) ==="

EGRESS=$(curl -4 -sS --connect-timeout 8 --max-time 12 https://api.ipify.org 2>/dev/null || echo unknown)
echo "[INFO] egress-ip: $EGRESS"

DNS=$(getent hosts xmlweather.vedur.is 2>/dev/null | awk '{print $1}' | head -1 || echo fail)
echo "[INFO] dns-xmlweather: $DNS"

if timeout 12 bash -c 'echo | nc -w10 xmlweather.vedur.is 443' 2>/dev/null; then
  echo "[PASS] tcp-443: connected"
  TCP_OK=1
else
  echo "[FAIL] tcp-443: timeout"
fi

for i in 1 2 3; do
  T0=$(date +%s)
  HTTP_CODE=$(curl -4 -sS -o "/tmp/vedur-run-$i.xml" -w '%{http_code}' \
    --connect-timeout 15 --max-time 35 "$VEDUR_URL" 2>/dev/null || echo "000")
  T1=$(date +%s)
  MS=$(( (T1 - T0) * 1000 ))
  BYTES=$(wc -c < "/tmp/vedur-run-$i.xml" 2>/dev/null || echo 0)
  if [[ "$HTTP_CODE" == "200" ]] && grep -q '<station' "/tmp/vedur-run-$i.xml" 2>/dev/null; then
    echo "[PASS] http-xml-run-$i: code=$HTTP_CODE bytes=$BYTES ms~=$MS"
    [[ $i -eq 1 ]] && cp "/tmp/vedur-run-$i.xml" "$SAMPLE_FILE"
  else
    echo "[FAIL] http-xml-run-$i: code=$HTTP_CODE bytes=$BYTES ms~=$MS"
    HTTP_OK=0
  fi
  [[ $i -lt 3 ]] && sleep 2
done

if [[ "$TCP_OK" -eq 1 && "$HTTP_OK" -eq 1 ]]; then
  VERDICT=SPIKE_PASS
  EXIT=0
else
  VERDICT=SPIKE_FAIL
  EXIT=1
fi

SHA=""
[[ -f "$SAMPLE_FILE" ]] && SHA=$(sha256sum "$SAMPLE_FILE" | awk '{print $1}')

{
  echo "{"
  echo "  \"evidenceType\": \"VEDUR_COLLECTOR_FEASIBILITY_SPIKE\","
  echo "  \"probedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"collectorCandidate\": \"$CANDIDATE\","
  echo "  \"collectorEgressIp\": \"$EGRESS\","
  echo "  \"dns\": \"$DNS\","
  echo "  \"spikePass\": $([[ "$VERDICT" == SPIKE_PASS ]] && echo true || echo false),"
  echo "  \"verdict\": \"$VERDICT\","
  echo "  \"sampleXmlSha256\": \"${SHA}\","
  echo "  \"sampleXmlPath\": \"$SAMPLE_FILE\""
  echo "}"
} > "$OUT"

echo ""
echo "=== $VERDICT ==="
echo "Written: $OUT"
cat "$OUT"
[[ -f "$SAMPLE_FILE" ]] && echo "Sample XML: $SAMPLE_FILE (first 500 chars):" && head -c 500 "$SAMPLE_FILE" && echo ""
exit $EXIT
