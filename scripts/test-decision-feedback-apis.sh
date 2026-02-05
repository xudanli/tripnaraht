#!/bin/bash

# 测试决策反馈API的bash脚本

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "🧪 开始测试决策反馈API..."
echo "📍 API Base URL: $API_BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  
  echo -n "测试 $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE_URL$endpoint" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    return 0
  else
    echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
    echo "响应: $body"
    return 1
  fi
}

# 生成测试数据
RUN_ID="test_run_$(date +%s)"
VARIANT_ID="test_variant_$(date +%s)"
CONFLICT_ID="test_conflict_$(date +%s)"

# 1. 测试计划变体反馈
PLAN_VARIANT_DATA=$(cat <<EOF
{
  "runId": "$RUN_ID",
  "variantId": "$VARIANT_ID",
  "variantStrategy": "balanced",
  "userChoice": "selected",
  "rating": 5,
  "reason": "测试：这个方案最符合我的需求"
}
EOF
)
test_api "计划变体反馈" "POST" "/decision/feedback/plan-variant" "$PLAN_VARIANT_DATA"

# 2. 测试约束冲突反馈
CONFLICT_DATA=$(cat <<EOF
{
  "runId": "$RUN_ID",
  "conflictId": "$CONFLICT_ID",
  "conflictType": "budget vs hotel_quality",
  "understood": true,
  "explanationClear": true,
  "tradeoffOptionsUseful": true,
  "selectedTradeoffOption": "增加预算 20%"
}
EOF
)
test_api "约束冲突反馈" "POST" "/decision/feedback/conflict" "$CONFLICT_DATA"

# 3. 测试决策质量反馈
QUALITY_DATA=$(cat <<EOF
{
  "runId": "$RUN_ID",
  "overallSatisfaction": 5,
  "planQuality": 5,
  "conflictExplanationQuality": 4,
  "tradeoffOptionsQuality": 4,
  "decisionSpeed": 5,
  "additionalFeedback": "测试：整体质量很好"
}
EOF
)
test_api "决策质量反馈" "POST" "/decision/feedback/decision-quality" "$QUALITY_DATA"

# 4. 测试批量反馈
BATCH_DATA=$(cat <<EOF
{
  "planVariantFeedbacks": [
    {
      "runId": "$RUN_ID",
      "variantId": "${VARIANT_ID}_1",
      "variantStrategy": "conservative",
      "userChoice": "selected",
      "rating": 4
    }
  ],
  "conflictFeedbacks": [
    {
      "runId": "$RUN_ID",
      "conflictId": "${CONFLICT_ID}_1",
      "conflictType": "budget vs hotel_quality",
      "understood": true,
      "explanationClear": true,
      "tradeoffOptionsUseful": true
    }
  ]
}
EOF
)
test_api "批量反馈" "POST" "/decision/feedback/batch" "$BATCH_DATA"

# 5. 测试反馈统计
START_DATE=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
END_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

if [ -n "$START_DATE" ] && [ -n "$END_DATE" ]; then
  test_api "反馈统计" "GET" "/decision/feedback/stats?startDate=$START_DATE&endDate=$END_DATE" ""
else
  test_api "反馈统计" "GET" "/decision/feedback/stats" ""
fi

echo ""
echo -e "${GREEN}✅ 所有测试完成！${NC}"
