#!/usr/bin/env bash
# 状态机烤机：需已启动 npm run dev，且 DB 可写 skill_execution_logs / llm_token_logs
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
TRIP_ID="${TRIP_ID:-b950dbf2-7583-4b43-b0c6-ddd947719c54}"
# 须为 trip_collaborators 中的 userId，否则 INTAKE 无法从 Trip 回填目的地/日期
USER_ID="${USER_ID:-5872f534-4fdf-483d-9e5a-464d3f36935d}"
REQ_ID="${REQ_ID:-bake-sm-$(date +%s)}"

echo "request_id=$REQ_ID trip_id=$TRIP_ID"

curl -sS --max-time "${TIMEOUT_SEC:-180}" -X POST "$BASE/api/agent/route_and_run" \
  -H 'Content-Type: application/json' \
  -d "{
    \"request_id\": \"$REQ_ID\",
    \"user_id\": \"$USER_ID\",
    \"trip_id\": \"$TRIP_ID\",
    \"message\": \"请根据当前行程草案，把第3天从阿克雷里改为在米湖周边休整并减少当日驾驶时长，其余天数尽量保持不变。\",
    \"structured_travel_input\": {
      \"destination\": \"IS\",
      \"start_date\": \"2026-06-01\",
      \"end_date\": \"2026-06-07\"
    },
    \"options\": {
      \"entry_point\": \"trip_list_page\",
      \"readonly_mode\": false,
      \"enable_llm_intent_compiler\": false
    }
  }" | tee "/tmp/bake-sm-$REQ_ID.json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('status:', d.get('result',{}).get('status'))
print('phase:', d.get('ui_state',{}).get('phase'))
print('ui_status:', d.get('ui_state',{}).get('ui_status'))
print('steps:', [s.get('step_name') for s in (d.get('ui_state') or {}).get('steps') or []])
"

TOKEN=$(curl -sS -X POST "$BASE/api/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tripnara.com","password":"admin123"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('accessToken',''))")

echo ""
echo "=== skill executions ==="
curl -sS "$BASE/api/admin/skills/executions?requestId=$REQ_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "=== llm usage ==="
curl -sS "$BASE/api/llm/usage?requestId=$REQ_ID" | python3 -m json.tool
