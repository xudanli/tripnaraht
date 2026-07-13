#!/usr/bin/env bash
# Minimal Vedur collector — fetch XML, HMAC sign, POST to TripNARA ingest API.
#
# Env (required):
#   VEDUR_COLLECTOR_HMAC_SECRET
#   TRIPNARA_INGEST_URL   e.g. http://127.0.0.1:19080/internal/evidence/weather/vedur
#
# Env (optional):
#   TRIP_ID, DAY_INDEX, COLLECTOR_ID, COLLECTOR_REGION, STATION_ID
#
# Usage (Frankfurt ECS):
#   export VEDUR_COLLECTOR_HMAC_SECRET='...'
#   export TRIPNARA_INGEST_URL='http://127.0.0.1:19080/internal/evidence/weather/vedur'
#   bash scripts/vedur-collector-minimal.sh
set -euo pipefail

TRIP_ID="${TRIP_ID:-a0a99999-9999-4999-8999-999999999999}"
DAY_INDEX="${DAY_INDEX:-1}"
COLLECTOR_ID="${COLLECTOR_ID:-vedur-collector-pilot}"
COLLECTOR_REGION="${COLLECTOR_REGION:-eu-central-1-frankfurt}"
STATION_ID="${STATION_ID:-1}"
VEDUR_URL="${VEDUR_URL:-https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&ids=${STATION_ID}}"
INGEST_PATH="/internal/evidence/weather/vedur"

SECRET="${VEDUR_COLLECTOR_HMAC_SECRET:-}"
INGEST_URL="${TRIPNARA_INGEST_URL:-}"

if [[ -z "$SECRET" ]]; then
  echo "Set VEDUR_COLLECTOR_HMAC_SECRET" >&2
  exit 1
fi
if [[ -z "$INGEST_URL" ]]; then
  echo "Set TRIPNARA_INGEST_URL (reverse tunnel or public ingress)" >&2
  exit 1
fi

TMP_PAYLOAD="$(mktemp /tmp/vedur-collector-payload.XXXXXX.xml)"
TMP_BODY="$(mktemp /tmp/vedur-collector-body.XXXXXX.json)"
trap 'rm -f "$TMP_PAYLOAD" "$TMP_BODY"' EXIT

echo "[collector] fetching Vedur XML station=$STATION_ID"
HTTP_CODE=$(curl -4 -sS -o "$TMP_PAYLOAD" -w '%{http_code}' \
  --connect-timeout 15 --max-time 35 "$VEDUR_URL")
if [[ "$HTTP_CODE" != "200" ]] || ! grep -q '<station' "$TMP_PAYLOAD"; then
  echo "[collector] Vedur fetch failed code=$HTTP_CODE" >&2
  exit 1
fi

PAYLOAD_SHA256=$(sha256sum "$TMP_PAYLOAD" | awk '{print $1}')
REQUEST_ID="req_$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
FETCHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIG_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

SIGN_CANON=$(printf 'POST\n%s\n%s\n%s\n%s\n%s' \
  "$INGEST_PATH" "$REQUEST_ID" "$SIG_TS" "$PAYLOAD_SHA256" "$COLLECTOR_ID")
SIGNATURE=$(printf '%s' "$SIGN_CANON" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

export TRIP_ID DAY_INDEX COLLECTOR_ID COLLECTOR_REGION STATION_ID FETCHED_AT
export PAYLOAD_SHA256 REQUEST_ID SIG_TS SIGNATURE

python3 - "$TMP_PAYLOAD" "$TMP_BODY" <<'PY'
import json, sys
payload_path, out_path = sys.argv[1], sys.argv[2]
with open(payload_path, "r", encoding="utf-8") as f:
    payload = f.read()
body = {
    "schemaVersion": "vedur.raw.v1",
    "tripId": __import__("os").environ.get("TRIP_ID"),
    "dayIndex": int(__import__("os").environ.get("DAY_INDEX", "1")),
    "provider": "iceland_met",
    "collectorId": __import__("os").environ.get("COLLECTOR_ID"),
    "collectorRegion": __import__("os").environ.get("COLLECTOR_REGION"),
    "stationId": __import__("os").environ.get("STATION_ID"),
    "fetchedAt": __import__("os").environ.get("FETCHED_AT"),
    "contentType": "application/xml",
    "payload": payload,
    "payloadSha256": __import__("os").environ.get("PAYLOAD_SHA256"),
    "requestId": __import__("os").environ.get("REQUEST_ID"),
    "signatureTimestamp": __import__("os").environ.get("SIG_TS"),
    "signature": __import__("os").environ.get("SIGNATURE"),
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(body, f)
PY

echo "[collector] POST $INGEST_URL trip=$TRIP_ID day=$DAY_INDEX"
RESP=$(curl -4 -sS -w '\n%{http_code}' -X POST "$INGEST_URL" \
  -H 'Content-Type: application/json' \
  --connect-timeout 15 --max-time 60 \
  -d @"$TMP_BODY")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo "[collector] http=$HTTP"
[[ "$HTTP" == "200" || "$HTTP" == "201" ]] || exit 1
