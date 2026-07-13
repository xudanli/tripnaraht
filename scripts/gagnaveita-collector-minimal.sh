#!/usr/bin/env bash
# Minimal Gagnaveita collector — fetch faerd2017_1, HMAC sign, POST to TripNARA ingest API.
#
# Env (required):
#   GAGNAVEITA_COLLECTOR_HMAC_SECRET  (or VEDUR_COLLECTOR_HMAC_SECRET)
#   TRIPNARA_INGEST_URL  e.g. http://127.0.0.1:19080/internal/evidence/road/gagnaveita
#
# Env (optional):
#   TRIP_ID, ROAD_ID, COLLECTOR_ID, COLLECTOR_REGION, GAGNAVEITA_URL
#
# Usage (Frankfurt ECS):
#   export GAGNAVEITA_COLLECTOR_HMAC_SECRET='...'
#   export TRIPNARA_INGEST_URL='http://127.0.0.1:19080/internal/evidence/road/gagnaveita'
#   bash scripts/gagnaveita-collector-minimal.sh
set -euo pipefail

TRIP_ID="${TRIP_ID:-a0a99999-9999-4999-8999-999999999999}"
ROAD_ID="${ROAD_ID:-F208}"
COLLECTOR_ID="${COLLECTOR_ID:-gagnaveita-collector-pilot}"
COLLECTOR_REGION="${COLLECTOR_REGION:-eu-central-1-frankfurt}"
GAGNAVEITA_URL="${GAGNAVEITA_URL:-https://gagnaveita.vegagerdin.is/api/faerd2017_1}"
INGEST_PATH="/internal/evidence/road/gagnaveita"

SECRET="${GAGNAVEITA_COLLECTOR_HMAC_SECRET:-${VEDUR_COLLECTOR_HMAC_SECRET:-}}"
INGEST_URL="${TRIPNARA_INGEST_URL:-}"

if [[ -z "$SECRET" ]]; then
  echo "Set GAGNAVEITA_COLLECTOR_HMAC_SECRET or VEDUR_COLLECTOR_HMAC_SECRET" >&2
  exit 1
fi
if [[ -z "$INGEST_URL" ]]; then
  echo "Set TRIPNARA_INGEST_URL (reverse tunnel or public ingress)" >&2
  exit 1
fi

TMP_PAYLOAD="$(mktemp /tmp/gagnaveita-collector-payload.XXXXXX.json)"
TMP_BODY="$(mktemp /tmp/gagnaveita-collector-body.XXXXXX.json)"
trap 'rm -f "$TMP_PAYLOAD" "$TMP_BODY"' EXIT

echo "[gagnaveita-collector] fetching $GAGNAVEITA_URL"
HTTP_CODE=$(curl -4 -fsSL -o "$TMP_PAYLOAD" -w '%{http_code}' \
  --connect-timeout 15 --max-time 60 \
  -H 'Accept: application/json' \
  "$GAGNAVEITA_URL")

BYTES=$(wc -c < "$TMP_PAYLOAD" | tr -d ' ')
RECORD_COUNT=$(python3 -c "import json; print(len(json.load(open('$TMP_PAYLOAD'))))")
if [[ "$HTTP_CODE" != "200" ]] || [[ "$RECORD_COUNT" -le 0 ]]; then
  echo "[gagnaveita-collector] fetch failed code=$HTTP_CODE records=$RECORD_COUNT" >&2
  exit 1
fi

PAYLOAD_SHA256=$(sha256sum "$TMP_PAYLOAD" | awk '{print $1}')
REQUEST_ID="req_$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
FETCHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIG_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

SIGN_CANON=$(printf 'POST\n%s\n%s\n%s\n%s\n%s' \
  "$INGEST_PATH" "$REQUEST_ID" "$SIG_TS" "$PAYLOAD_SHA256" "$COLLECTOR_ID")
SIGNATURE=$(printf '%s' "$SIGN_CANON" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

export TRIP_ID ROAD_ID COLLECTOR_ID COLLECTOR_REGION FETCHED_AT
export PAYLOAD_SHA256 REQUEST_ID SIG_TS SIGNATURE

python3 - "$TMP_PAYLOAD" "$TMP_BODY" <<'PY'
import json, sys
payload_path, out_path = sys.argv[1], sys.argv[2]
with open(payload_path, "r", encoding="utf-8") as f:
    payload = f.read()
body = {
    "schemaVersion": "gagnaveita.raw.v1",
    "tripId": __import__("os").environ.get("TRIP_ID"),
    "roadId": __import__("os").environ.get("ROAD_ID"),
    "provider": "vegagerdin_gagnaveita",
    "collectorId": __import__("os").environ.get("COLLECTOR_ID"),
    "collectorRegion": __import__("os").environ.get("COLLECTOR_REGION"),
    "fetchedAt": __import__("os").environ.get("FETCHED_AT"),
    "contentType": "application/json",
    "payload": payload,
    "payloadSha256": __import__("os").environ.get("PAYLOAD_SHA256"),
    "requestId": __import__("os").environ.get("REQUEST_ID"),
    "signatureTimestamp": __import__("os").environ.get("SIG_TS"),
    "signature": __import__("os").environ.get("SIGNATURE"),
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(body, f)
PY

echo "[gagnaveita-collector] POST $INGEST_URL trip=$TRIP_ID road=$ROAD_ID bytes=$BYTES records=$RECORD_COUNT"
RESP=$(curl -4 -sS -w '\n%{http_code}' -X POST "$INGEST_URL" \
  -H 'Content-Type: application/json' \
  --connect-timeout 15 --max-time 90 \
  -d @"$TMP_BODY")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo "[gagnaveita-collector] http=$HTTP sha256=$PAYLOAD_SHA256"
[[ "$HTTP" == "200" || "$HTTP" == "201" ]] || exit 1
