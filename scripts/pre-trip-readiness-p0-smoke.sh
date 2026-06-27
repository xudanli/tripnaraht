#!/usr/bin/env bash
# Pre-trip Readiness P0 — S2/S3 冒烟（Landmannalaugar trip）
set -euo pipefail

BACKEND="${BACKEND:-http://127.0.0.1:3000}"
TRIP_ID="${TRIP_ID:-15a7f7aa-d26b-41ff-ba94-b3de488214f3}"
ITEM_ID="${ITEM_ID:-0eff798b-8ac9-4cb3-b4e0-09b73a78950b}"

fail=0
check() {
  local label="$1"
  local ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo "✅ $label"
  else
    echo "❌ $label"
    fail=1
  fi
}

echo "=== Pre-trip Readiness P0 smoke ==="
echo "BACKEND=$BACKEND TRIP_ID=$TRIP_ID"

REPORT=$(curl -sf "$BACKEND/api/trips/$TRIP_ID/feasibility-report")
python3 - <<'PY' "$REPORT"
import json, sys
raw = sys.argv[1]
d = json.loads(raw).get("data", json.loads(raw))
dims = [x.get("key") for x in d.get("dimensions", [])]
access = [i for i in d.get("issues", []) if str(i.get("issueKind", "")).startswith("poi_access")]
res = [i for i in access if i.get("issueKind") == "poi_access_reservation_required"]
ge = d.get("gateExecute")
print("dimensions:", dims)
print("access_capacity_in_dims:", "access_capacity" in dims)
print("reservation_issues:", len(res))
print("gateExecute:", ge)
if res:
    v = res[0].get("visitorAccess", {})
    print("sample visitorAccess.poiId:", v.get("evaluation", {}).get("poiId"))
open("/tmp/p0-smoke.json", "w").write(json.dumps({
    "access_capacity": "access_capacity" in dims,
    "reservation_count": len(res),
    "gate_blocked": (ge or {}).get("blocked"),
    "gate_present": ge is not None,
}, indent=2))
PY

ACCESS_CAP=$(python3 -c "import json; print(1 if json.load(open('/tmp/p0-smoke.json'))['access_capacity'] else 0)")
RES_ISSUE=$(python3 -c "import json; d=json.load(open('/tmp/p0-smoke.json')); print(1 if d['reservation_count']>0 else 0)")
GATE_OK=$(python3 -c "import json; d=json.load(open('/tmp/p0-smoke.json')); print(1 if d['gate_present'] and d['gate_blocked'] is False else 0)")

check "S2 access_capacity dimension" "$ACCESS_CAP"
check "Landmannalaugar poi_access_reservation_required" "$RES_ISSUE"
check "gateExecute.blocked=false" "$GATE_OK"

HTTP_CODE=$(curl -s -o /tmp/p0-res-evidence.json -w "%{http_code}" -X POST \
  "$BACKEND/api/trips/$TRIP_ID/reservation-evidence" \
  -H 'Content-Type: application/json' \
  -d "{\"tripItemId\":\"$ITEM_ID\",\"poiId\":\"is.landmannalaugar\",\"resource\":\"PARKING\",\"dateISO\":\"2026-06-22\",\"plannedArrival\":\"09:00\",\"confirmationCode\":\"PARKA-SMOKE-$(date +%s)\"}")

if [[ "$HTTP_CODE" == "200" ]]; then
  check "reservation-evidence HTTP 200" 1
else
  echo "❌ reservation-evidence HTTP $HTTP_CODE"
  cat /tmp/p0-res-evidence.json 2>/dev/null || true
  fail=1
fi

EVAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BACKEND/api/poi-access-capacity/evaluate?poiId=is.landmannalaugar&dateISO=2026-06-22&arrivalTime=09:00")
if [[ "$EVAL_CODE" == "200" ]]; then
  check "GET /poi-access-capacity/evaluate HTTP 200" 1
else
  echo "⚠️  poi-access-capacity/evaluate HTTP $EVAL_CODE (optional)"
fi

PLANNING=$(curl -sf "$BACKEND/api/trips/$TRIP_ID/planning-conflicts" 2>/dev/null || echo '{}')
python3 - <<'PY' "$PLANNING"
import json, sys
raw = sys.argv[1]
d = json.loads(raw).get("data", json.loads(raw) if raw.strip().startswith("{") else {})
summary = d.get("summary") or {}
conflicts = d.get("conflicts") or []
access = [c for c in conflicts if c.get("category") == "access_capacity"]
print("planning-conflicts total:", summary.get("total"))
print("planning-conflicts mustHandle:", summary.get("mustHandle"))
print("access_capacity items:", len(access))
print("gateExecute:", d.get("gateExecute"))
open("/tmp/p0-planning-smoke.json", "w").write(json.dumps({
    "has_summary": isinstance(summary.get("total"), int),
    "has_conflicts": isinstance(conflicts, list),
    "gate_present": d.get("gateExecute") is not None,
}, indent=2))
PY

PLAN_OK=$(python3 -c "import json; d=json.load(open('/tmp/p0-planning-smoke.json')); print(1 if d['has_summary'] and d['has_conflicts'] and d['gate_present'] else 0)" 2>/dev/null || echo 0)
check "GET /planning-conflicts aggregate" "$PLAN_OK"

echo ""
echo "=== [8] Buffer repair read-only probe ==="
BUFFER_PROBE=$(curl -sf "$BACKEND/api/trips/$TRIP_ID/feasibility-report" || echo '{}')
python3 - <<'PY' "$BUFFER_PROBE"
import json, sys
raw = sys.argv[1]
d = json.loads(raw).get("data", json.loads(raw) if raw.strip().startswith("{") else {})
issues = d.get("issues") or []
travel = [i for i in issues if i.get("issueKind") in ("inter_day_travel", "same_day_travel", "buffer_insufficient")]
must = [i for i in travel if i.get("priority") == "must_handle"]
add_buf = []
for i in travel:
    for o in (i.get("repairOptions") or []):
        if o.get("actionType") == "add_buffer" and (o.get("payload") or {}).get("bufferMinutes"):
            add_buf.append(o)
print("travel_issues:", len(travel))
print("must_handle_travel:", len(must))
print("add_buffer_minute_options:", len(add_buf))
if must:
    print("sample_issue_id:", must[0].get("id"))
    print("sample_repair_ids:", [o.get("id") for o in (must[0].get("repairOptions") or [])[:5]])
open("/tmp/p0-buffer-probe.json", "w").write(json.dumps({
    "has_add_buffer_30": any((o.get("payload") or {}).get("bufferMinutes") == 30 for o in add_buf),
    "must_travel_count": len(must),
    "sample_issue_id": must[0].get("id") if must else None,
}, indent=2))
PY

BUF30=$(python3 -c "import json; d=json.load(open('/tmp/p0-buffer-probe.json')); print(1 if d.get('has_add_buffer_30') else 0)" 2>/dev/null || echo 0)
MUST_TRAV=$(python3 -c "import json; d=json.load(open('/tmp/p0-buffer-probe.json')); print(1 if d.get('must_travel_count',0)>0 else 0)" 2>/dev/null || echo 0)
check "inter_day must + add_buffer 30min option" "$(( BUF30 && MUST_TRAV ))"

if [[ "${1:-}" == "--buffer-repair-apply" ]]; then
  echo ""
  echo "=== [--buffer-repair-apply] Apply minute buffer + validate ==="
  ISSUE_ID="${ISSUE_ID:-$(python3 -c "import json; print(json.load(open('/tmp/p0-buffer-probe.json')).get('sample_issue_id') or '')")}"
  OPTION_ID="${OPTION_ID:-buffer-add-30}"
  if [[ -z "$ISSUE_ID" ]]; then
    echo "❌ No inter_day must issue — skip apply"
    fail=1
  else
    BEFORE_MUST=$(curl -sf "$BACKEND/api/trips/$TRIP_ID/planning-conflicts" | python3 -c "import json,sys; d=json.load(sys.stdin).get('data',{}); print(d.get('summary',{}).get('mustHandle',-1))")
    APPLY_CODE=$(curl -s -o /tmp/p0-buffer-apply.json -w "%{http_code}" -X POST \
      "$BACKEND/api/trips/$TRIP_ID/feasibility-report/issues/$ISSUE_ID/apply-repair" \
      -H 'Content-Type: application/json' \
      -d "{\"optionId\":\"$OPTION_ID\"}")
    if [[ "$APPLY_CODE" == "200" ]]; then
      check "apply-repair $OPTION_ID HTTP 200" 1
      curl -sf -X POST "$BACKEND/api/trips/$TRIP_ID/feasibility-report/validate" \
        -H 'Content-Type: application/json' -d "{}" >/dev/null || true
      AFTER_MUST=$(curl -sf "$BACKEND/api/trips/$TRIP_ID/planning-conflicts" | python3 -c "import json,sys; d=json.load(sys.stdin).get('data',{}); print(d.get('summary',{}).get('mustHandle',-1))")
      echo "mustHandle before=$BEFORE_MUST after=$AFTER_MUST"
      if [[ "$AFTER_MUST" -ge 0 && "$BEFORE_MUST" -ge 0 && "$AFTER_MUST" -le "$BEFORE_MUST" ]]; then
        check "mustHandle not increased after buffer apply" 1
      else
        echo "⚠️  could not compare mustHandle"
      fi
    else
      echo "❌ apply-repair HTTP $APPLY_CODE"
      cat /tmp/p0-buffer-apply.json 2>/dev/null || true
      fail=1
    fi
  fi
fi

if [[ " $* " == *" --travel-timing-single-source "* ]]; then
  echo ""
  echo "=== [--travel-timing-single-source] Geysir trip T1–T7 ==="
  TT_TRIP="${TRAVEL_TIMING_TRIP:-492ff5d0-8461-461a-b975-3f65474e8108}"
  TT_DAY="${TRAVEL_TIMING_DAY:-b754825e-6e7c-4d68-ad91-ef027a406696}"
  curl -sf "$BACKEND/api/itinerary-items/trip/$TT_TRIP/days/$TT_DAY/travel-info" \
    -o /tmp/p0-travel-info.json
  curl -sf "$BACKEND/api/trips/$TT_TRIP/feasibility-report" \
    -o /tmp/p0-feasibility-travel.json
  curl -sf -X POST "$BACKEND/api/trips/$TT_TRIP/feasibility-report/validate" \
    -H 'Content-Type: application/json' -d '{}' \
    -o /tmp/p0-feasibility-validated.json 2>/dev/null || true
  curl -sf "$BACKEND/api/trips/$TT_TRIP" -o /tmp/p0-trip-travel.json

  python3 - <<'PY'
import json

info = json.load(open("/tmp/p0-travel-info.json")).get("data", {})
seg = next(
    (
        s
        for s in info.get("segments", [])
        if "Geysir" in (s.get("toPlace") or "")
        and ("机场" in (s.get("fromPlace") or "") or "Keflav" in (s.get("fromPlace") or ""))
    ),
    None,
)
if not seg:
    seg = next((s for s in info.get("segments", []) if "Geysir" in s.get("toPlace", "")), None)
report = json.load(open("/tmp/p0-feasibility-travel.json")).get("data", {})
trip = json.load(open("/tmp/p0-trip-travel.json")).get("data", {})

geysir_item = next(
    (
        it
        for day in trip.get("TripDay", [])
        for it in day.get("ItineraryItem", [])
        if "Geysir" in (it.get("Place") or {}).get("nameCN", "")
    ),
    None,
)

duration = seg.get("duration") if seg else None
distance = seg.get("distance") if seg else None
t1 = duration is not None and 15 <= duration <= 25 and abs(distance - 18244) < 500

day1_must = [
    i
    for i in report.get("issues", [])
    if i.get("issueKind") == "same_day_travel"
    and i.get("priority") == "must_handle"
    and (i.get("anchors") or {}).get("toDayNumber") == 1
]
t5 = len(day1_must) == 0

db_dur = geysir_item.get("travelFromPreviousDuration") if geysir_item else None
t7 = db_dur is not None and duration is not None and abs(db_dur - duration) <= 1

open("/tmp/p0-travel-timing-smoke.json", "w").write(
    json.dumps(
        {
            "t1": t1,
            "t5": t5,
            "t7": t7,
            "duration": duration,
            "distance": distance,
            "db_duration": db_dur,
            "day1_must_count": len(day1_must),
        },
        indent=2,
    )
)
print("travel-info duration:", duration, "distance:", distance)
print("day1 same_day must:", len(day1_must))
print("db travelFromPreviousDuration:", db_dur)
PY

  TT1=$(python3 -c "import json; print(1 if json.load(open('/tmp/p0-travel-timing-smoke.json'))['t1'] else 0)" 2>/dev/null || echo 0)
  TT5=$(python3 -c "import json; print(1 if json.load(open('/tmp/p0-travel-timing-smoke.json'))['t5'] else 0)" 2>/dev/null || echo 0)
  TT7=$(python3 -c "import json; print(1 if json.load(open('/tmp/p0-travel-timing-smoke.json'))['t7'] else 0)" 2>/dev/null || echo 0)
  check "T1 travel-info airport→Geysir ~18min" "$TT1"
  check "T5 no day1 same_day_travel must" "$TT5"
  check "T7 DB duration aligned with travel-info" "$TT7"
fi

if [[ " $* " == *" --constraints-summary "* ]]; then
  echo ""
  echo "=== [--constraints-summary] Planning constraints BFF ==="
  CS_TRIP="${CONSTRAINTS_TRIP:-492ff5d0-8461-461a-b975-3f65474e8108}"
  curl -sf "$BACKEND/api/trips/$CS_TRIP/constraints-summary" -o /tmp/p0-constraints-summary.json
  curl -sf "$BACKEND/api/trips/$CS_TRIP/planning-conflicts?includeConstraintsSummary=1" \
    -o /tmp/p0-planning-with-cs.json 2>/dev/null || echo '{}' > /tmp/p0-planning-with-cs.json

  python3 - <<'PY'
import json

summary = json.load(open("/tmp/p0-constraints-summary.json")).get("data", {})
planning = json.load(open("/tmp/p0-planning-with-cs.json")).get("data", {})
embedded = planning.get("constraintsSummary") or {}

ok_summary = (
    summary.get("tripId")
    and "allReady" in summary
    and "pendingItems" in summary
    and isinstance(summary.get("pendingItems"), list)
)
ok_embedded = embedded.get("tripId") == summary.get("tripId") if embedded else False

open("/tmp/p0-constraints-smoke.json", "w").write(json.dumps({
    "has_summary": ok_summary,
    "embedded_match": ok_embedded,
    "pending_count": summary.get("pendingCount"),
    "transport_status": (summary.get("transport") or {}).get("status"),
}, indent=2))
print("summary pending:", summary.get("pendingCount"))
print("transport:", (summary.get("transport") or {}).get("status"))
print("embedded:", ok_embedded)
PY

  CS_OK=$(python3 -c "import json; d=json.load(open('/tmp/p0-constraints-smoke.json')); print(1 if d['has_summary'] else 0)" 2>/dev/null || echo 0)
  CS_TRANSPORT=$(python3 -c "import json; d=json.load(open('/tmp/p0-constraints-smoke.json')); print(1 if d.get('transport_status')!='missing' or d.get('pending_count',0)>0 else 0)" 2>/dev/null || echo 0)
  check "GET constraints-summary schema" "$CS_OK"
  check "transport inferred or pending surfaced" "$CS_TRANSPORT"

  STALE=$(curl -sf -X PATCH "$BACKEND/api/trips/$CS_TRIP/constraints/confirm" \
    -H 'Content-Type: application/json' -d '{"constraintsVersion":999}' 2>/dev/null \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('error',{}).get('code',''))" 2>/dev/null || echo "")
  if [[ "$STALE" == "CONSTRAINTS_NOT_READY" || "$STALE" == "CONSTRAINTS_STALE" ]]; then
    check "PATCH confirm rejects not-ready/stale" 1
  else
    echo "❌ PATCH confirm expected 4xx code, got $STALE"
    fail=1
  fi

  ALL_READY=$(python3 -c "import json; print(1 if json.load(open('/tmp/p0-constraints-summary.json'))['data'].get('allReady') else 0)" 2>/dev/null || echo 0)
  if [[ "$ALL_READY" == "1" ]]; then
    VER=$(python3 -c "import json; print(json.load(open('/tmp/p0-constraints-summary.json'))['data']['constraintsVersion'])" 2>/dev/null || echo 0)
    CONF_OK=$(curl -sf -X PATCH "$BACKEND/api/trips/$CS_TRIP/constraints/confirm" \
      -H 'Content-Type: application/json' -d "{\"constraintsVersion\":$VER}" 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(1 if d.get('success') and d.get('data',{}).get('isUserConfirmed') else 0)" 2>/dev/null || echo 0)
    check "PATCH confirm success when allReady" "$CONF_OK"
  fi
fi

if [[ " $* " == *" --assess-planning-alignment "* ]]; then
  echo ""
  echo "=== [--assess-planning-alignment] POST /assess vs planning-conflicts ==="
  ASSESS_TRIP="${ASSESS_TRIP:-492ff5d0-8461-461a-b975-3f65474e8108}"
  ASSESS_MUST_TRIP="${ASSESS_MUST_TRIP:-15a7f7aa-d26b-41ff-ba94-b3de488214f3}"

  for TID in "$ASSESS_TRIP" "$ASSESS_MUST_TRIP"; do
    curl -sf -X POST "$BACKEND/api/trips/$TID/assess" \
      -H 'Content-Type: application/json' -d '{}' -o "/tmp/p0-assess-$TID.json"
    curl -sf "$BACKEND/api/trips/$TID/planning-conflicts" -o "/tmp/p0-planning-$TID.json"
    python3 - <<PY "$TID"
import json, sys
tid = sys.argv[1]
assess = json.load(open(f"/tmp/p0-assess-{tid}.json")).get("data", {})
planning = json.load(open(f"/tmp/p0-planning-{tid}.json")).get("data", {})
pc = assess.get("planningConflicts") or {}
ps = pc.get("summary") or {}
cs = planning.get("summary") or {}
must = ps.get("mustHandle", -1)
suggest = ps.get("suggestAdjust", -1)
feas_days = [
    d.get("date")
    for d in assess.get("days", [])
    if any(x.get("dimension") == "FEASIBILITY" for x in (d.get("dimensions") or []))
]
ok = (
    pc
    and ps.get("mustHandle") == cs.get("mustHandle")
    and ps.get("suggestAdjust") == cs.get("suggestAdjust")
    and assess.get("effectiveTravelMode") in ("DRIVING", "PUBLIC_TRANSIT", "MIXED")
)
if must > 0 and assess.get("hasIssuesDays", 0) == 0:
    ok = False
if must == 0 and suggest > 0 and assess.get("needsAttentionDays", 0) == 0 and assess.get("hasIssuesDays", 0) == 0:
    ok = False
open(f"/tmp/p0-assess-align-{tid}.json", "w").write(json.dumps({
    "ok": ok,
    "must": must,
    "suggest": suggest,
    "hasIssuesDays": assess.get("hasIssuesDays"),
    "needsAttentionDays": assess.get("needsAttentionDays"),
    "feasibilityDays": len(feas_days),
    "tripWide": len(pc.get("tripWideItems") or []),
    "verdict": ps.get("verdictStatus"),
}, indent=2))
print(f"trip {tid}: must={must} suggest={suggest} needsAttention={assess.get('needsAttentionDays')} tripWide={len(pc.get('tripWideItems') or [])}")
PY
    ALN=$(python3 -c "import json; print(1 if json.load(open('/tmp/p0-assess-align-$TID.json'))['ok'] else 0)" 2>/dev/null || echo 0)
    check "assess aligned with planning-conflicts ($TID)" "$ALN"
  done
fi

exit $fail
