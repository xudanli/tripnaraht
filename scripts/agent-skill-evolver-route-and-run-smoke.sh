#!/usr/bin/env bash
# SkillEvolver Agent 全链路 smoke：POST /api/agent/route_and_run（冰岛高地 DEM 场景）
# 前置：npm run dev 已启动；DB 已 sync skillEvolver（或 export SKILL_EVOLVER_INJECT_COUNTRY_PACK=IS）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
REQ_ID="${REQ_ID:-skill-evolver-agent-$(date +%s)}"
TRIP_ID="${TRIP_ID:-b950dbf2-7583-4b43-b0c6-ddd947719c54}"
USER_ID="${USER_ID:-5872f534-4fdf-483d-9e5a-464d3f36935d}"
TIMEOUT="${TIMEOUT_SEC:-180}"
OUT="/tmp/skill-evolver-route-and-run-${REQ_ID}.json"

echo "[agent-e2e] waiting for $BASE/api ..."
for i in $(seq 1 60); do
  if curl -sf --max-time 2 "$BASE/api" >/dev/null 2>&1 || curl -sf --max-time 2 "$BASE/api-docs" >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "[agent-e2e] server not up — run: npm run dev" >&2
    exit 1
  fi
  sleep 2
done

echo "[agent-e2e] POST route_and_run request_id=$REQ_ID trip_id=$TRIP_ID"
curl -sS --max-time "$TIMEOUT" -X POST "$BASE/api/agent/route_and_run" \
  -H 'Content-Type: application/json' \
  -d "{
    \"request_id\": \"$REQ_ID\",
    \"user_id\": \"$USER_ID\",
    \"trip_id\": \"$TRIP_ID\",
    \"message\": \"我想7月走冰岛高地F路，目前没有DEM海拔证明和高地许可，请评估是否应拒绝并说明需要补哪些证据。\",
    \"structured_travel_input\": {
      \"destination\": \"IS\",
      \"start_date\": \"2026-07-01\",
      \"end_date\": \"2026-07-08\"
    },
    \"options\": {
      \"intent_mode\": \"TRIP_PLANNING\",
      \"enable_llm_intent_compiler\": false,
      \"entry_point\": \"trip_list_page\"
    }
  }" >"$OUT"

python3 - "$OUT" <<'PY'
import json, re, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    d = json.load(f)

raw = json.dumps(d, ensure_ascii=False)
status = (d.get("result") or {}).get("status")
answer = (d.get("result") or {}).get("answer_text") or ""
skills = []
obs = d.get("observability") or {}
trace = (obs.get("trace") or {}) if isinstance(obs, dict) else {}
for step in (trace.get("steps") or []):
    if isinstance(step, dict) and step.get("skills_called"):
        skills.extend(step["skills_called"])

has_country_pack = "countryPack.getBlocks" in skills or "countryPack.getBlocks" in raw
has_evolver_key = "SKILL_EVOLVER_COUNTRY_PACK" in raw or "SkillEvolver Country Pack" in raw
has_dem = bool(re.search(r"DEM|高地|海拔", raw, re.I))
has_reject = bool(re.search(r"REJECT|拒绝", raw, re.I))

print("status:", status)
print("answer preview:", answer[:200].replace("\n", " "))
print("countryPack.getBlocks in trace:", "countryPack.getBlocks" in skills or "countryPack.getBlocks" in raw)
print("SkillEvolver block in response:", has_evolver_key)
print("DEM keywords in response:", has_dem)
print("REJECT keywords in response:", has_reject)
print("response saved:", path)

# HTTP 响应通常不含 ContextBlock 原文；编排成功 + 回答含 DEM/拒绝 语义即视为联调通过
# （块级注入请用 npm run agent:country-pack-evolver-smoke 验证）
status_ok = status in ("OK", "SUCCESS", "PARTIAL")
ok = status_ok and has_dem and (has_reject or has_evolver_key or has_country_pack)
sys.exit(0 if ok else 1)
PY

echo "[agent-e2e] PASS"
