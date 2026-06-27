#!/usr/bin/env bash
# ScheduleTab 时间轴聚合 BFF smoke
# Usage:
#   BACKEND=http://127.0.0.1:3000 TRIP_ID=<uuid> ./scripts/schedule-timeline-p0-smoke.sh
set -euo pipefail

BACKEND="${BACKEND:-http://127.0.0.1:3000}"
TRIP_ID="${TRIP_ID:-492ff5d0-8461-461a-b975-3f65474e8108}"
AUTH=()
[[ -n "${AUTH_TOKEN:-}" ]] && AUTH=(-H "Authorization: Bearer ${AUTH_TOKEN}")

curl_json() {
  if ((${#AUTH[@]})); then
    curl -sS "${AUTH[@]}" "$@"
  else
    curl -sS "$@"
  fi
}

echo "== P0 schedule-timeline (items+schedule+metrics, no travel) =="
curl_json "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?include=items,schedule,metrics&travelInfoMode=none" \
  | jq '{success, tripId: .data.tripId, dayCount: (.data.days|length), etag: .data.etag, hasSummary: (.data.metricsSummary != null)}'

echo ""
echo "== P0 pagination from=0 limit=2 =="
curl_json "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?include=items&from=0&limit=2&travelInfoMode=none" \
  | jq '{success, dayCount: (.data.days|length), dates: [.data.days[].date]}'

echo ""
echo "== P0 reject recalculate on GET =="
curl_json "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?travelInfoMode=recalculate" \
  | jq '{success, code: .error.code}'

echo ""
echo "== P1 batch travel-info (cached) =="
curl_json "${BACKEND}/api/itinerary-items/trip/${TRIP_ID}/travel-info" \
  | jq '{success, source: .data.source, dayCount: (.data.days|length), summary: .data.summary}'

echo ""
echo "== P2 ETag + 304 silent refresh =="
HDR=$(mktemp)
if ((${#AUTH[@]})); then
  curl -sS "${AUTH[@]}" -D "$HDR" -o /dev/null \
    "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?include=items&travelInfoMode=none"
else
  curl -sS -D "$HDR" -o /dev/null \
    "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?include=items&travelInfoMode=none"
fi
ETAG=$(grep -i '^etag:' "$HDR" | awk '{print $2}' | tr -d '"\r')
echo "ETag: ${ETAG}"
HTTP304=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "If-None-Match: \"${ETAG}\"" \
  "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?include=items&travelInfoMode=none")
echo "If-None-Match replay HTTP: ${HTTP304}"
rm -f "$HDR"

echo ""
echo "== P2 single-day travel-info mode=cached =="
curl_json "${BACKEND}/api/itinerary-items/trip/${TRIP_ID}/days/$(curl_json "${BACKEND}/api/trips/${TRIP_ID}/schedule-timeline?include=items&from=0&limit=1&travelInfoMode=none" | jq -r '.data.days[0].dayId')/travel-info?mode=cached" \
  | jq '{success, source: .data.source, segmentCount: .data.summary.segmentCount}'

echo ""
echo "OK schedule-timeline P0/P2 smoke"
