#!/bin/bash
# 测试 POST /api/trips/from-natural-language 接口（含 conditionalInputs）
# 用法: ./scripts/test-from-natural-language-api.sh [BASE_URL]
# 默认 BASE_URL=http://localhost:3000

set -e
BASE_URL="${1:-http://localhost:3000}"
SESSION_ID="test_nl_$(date +%s)_$$"

echo "=== 1. 新对话：完整基础信息（目的地+日期+预算，应触发补充偏好问题） ==="
RESP1=$(curl -s -X POST "$BASE_URL/api/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"我想2026年4月去新西兰旅行10天，预算3万\",\"sessionId\":\"$SESSION_ID\",\"isNewConversation\":true}")
echo "$RESP1" | (command -v jq >/dev/null && jq '.' || python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin), indent=2, ensure_ascii=False))" 2>/dev/null) || echo "$RESP1"
SESSION=$(echo "$RESP1" | (command -v jq >/dev/null && jq -r '.data.sessionId // .sessionId // empty' || python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',d).get('sessionId',''))" 2>/dev/null))
echo "sessionId: $SESSION"
echo ""

echo "=== 2. 继续对话：补充目的地/日期（触发补充偏好问题） ==="
# 若第一步返回 needsClarification，这里模拟用户回答后再次 POST，或直接发「补充偏好信息」触发短路径
RESP2=$(curl -s -X POST "$BASE_URL/api/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"补充偏好信息（如活动、节奏等）\",\"sessionId\":\"$SESSION\"}")
echo "$RESP2" | (command -v jq >/dev/null && jq '.' || python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin), indent=2, ensure_ascii=False))" 2>/dev/null) || echo "$RESP2"
echo ""

echo "=== 3. 检查 clarificationQuestions 中的 conditionalInputs ==="
# 合并两步响应的 questions 检查
# 从两步响应中查找 supplement_preferences（第二步更可能包含）
if command -v jq >/dev/null; then
  SUPPLEMENT_Q=$(echo "$RESP2" | jq '.data.clarificationQuestions[]? | select(.id == "supplement_preferences")' 2>/dev/null)
  [ -z "$SUPPLEMENT_Q" ] || [ "$SUPPLEMENT_Q" = "null" ] && SUPPLEMENT_Q=$(echo "$RESP1" | jq '.data.clarificationQuestions[]? | select(.id == "supplement_preferences")' 2>/dev/null)
  QUESTIONS_MERGED=$(echo "$RESP2" | jq '.data.clarificationQuestions // .clarificationQuestions // []')
else
  SUPPLEMENT_Q=$(echo "$RESP2" | python3 -c "import json,sys; d=json.load(sys.stdin); q=d.get('data',d).get('clarificationQuestions',[]); s=[x for x in q if x.get('id')=='supplement_preferences']; print(json.dumps(s[0] if s else {}))" 2>/dev/null)
  [ "$SUPPLEMENT_Q" = "{}" ] && SUPPLEMENT_Q=$(echo "$RESP1" | python3 -c "import json,sys; d=json.load(sys.stdin); q=d.get('data',d).get('clarificationQuestions',[]); s=[x for x in q if x.get('id')=='supplement_preferences']; print(json.dumps(s[0] if s else {}))" 2>/dev/null)
  QUESTIONS_MERGED=$(echo "$RESP2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('data',d).get('clarificationQuestions',[])))" 2>/dev/null)
fi
if [ -n "$SUPPLEMENT_Q" ] && [ "$SUPPLEMENT_Q" != "null" ] && [ "$SUPPLEMENT_Q" != "{}" ]; then
  echo "supplement_preferences 问题:"
  echo "$SUPPLEMENT_Q" | (command -v jq >/dev/null && jq '.' || echo "$SUPPLEMENT_Q")
  COND_CNT=$(echo "$SUPPLEMENT_Q" | (command -v jq >/dev/null && jq '.conditionalInputs | length' || echo "0"))
  if [ "$COND_CNT" -gt 0 ] 2>/dev/null; then
    echo "✓ conditionalInputs 存在，数量: $COND_CNT"
  else
    echo "✗ 未找到 conditionalInputs"
  fi
else
  echo "（supplement_preferences 未出现在本次测试的两步响应中）"
  echo "提示：发「补充偏好信息（如活动、节奏等）」通常会在第二步返回该问题"
fi
