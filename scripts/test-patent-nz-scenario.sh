#!/bin/bash
# 测试专利场景：新西兰 5 天自驾游
# 用法: ./scripts/test-patent-nz-scenario.sh [BASE_URL]
# 前置：需先启动服务 npm run dev 或 npm run backend:dev

set -e
BASE_URL="${1:-http://localhost:3000}"

echo "=========================================="
echo "专利场景测试：新西兰 5 天自驾游"
echo "=========================================="
echo ""
echo "用户输入: 帮我规划一次新西兰 5 天自驾游，从奥克兰出发，想去皇后镇和米尔福德峡湾"
echo ""

SESSION_ID="test_patent_$(date +%s)_$$"

echo "【1】POST /api/trips/from-natural-language"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"帮我规划一次新西兰 5 天自驾游，从奥克兰出发，想去皇后镇和米尔福德峡湾\",
    \"sessionId\": \"$SESSION_ID\",
    \"isNewConversation\": true
  }")
HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)

echo "HTTP $HTTP_CODE"
if command -v jq >/dev/null 2>&1; then
  echo "$HTTP_BODY" | jq -C '.' 2>/dev/null || echo "$HTTP_BODY"
else
  echo "$HTTP_BODY"
fi

if [ "$HTTP_CODE" = "404" ] && echo "$HTTP_BODY" | grep -q "路线方向"; then
  echo ""
  echo "→ 新西兰(NZ)暂无 RouteDirection 数据，需先导入 NZ 路线方向"
fi

echo ""
echo "【2】POST /api/agent/route_and_run"
RESP2=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/agent/route_and_run" \
  -H "Content-Type: application/json" \
  -d "{
    \"request_id\": \"test_patent_${SESSION_ID}\",
    \"user_id\": \"test-user\",
    \"message\": \"帮我规划一次新西兰 5 天自驾游，从奥克兰出发，想去皇后镇和米尔福德峡湾\",
    \"options\": { \"max_seconds\": 90, \"max_steps\": 12 }
  }")
BODY2=$(echo "$RESP2" | head -n -1)
CODE2=$(echo "$RESP2" | tail -n 1)
echo "HTTP $CODE2"
if command -v jq >/dev/null 2>&1; then
  echo "$BODY2" | jq -C '.result.status, .result.answer_text' 2>/dev/null || echo "$BODY2"
else
  echo "$BODY2"
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
