#!/bin/bash
# scripts/test-planning-workbench-api.sh
# 规划工作台 API 测试脚本（Shell版本）

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "🚀 开始测试规划工作台 API..."
echo "API Base URL: $API_BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
PASSED=0
FAILED=0

# 测试函数
test_api() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  
  echo "📋 测试: $name"
  
  if [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      "${API_BASE_URL}${endpoint}")
  else
    response=$(curl -s -w "\n%{http_code}" -X GET \
      "${API_BASE_URL}${endpoint}")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "200" ]; then
    success=$(echo "$body" | jq -r '.success // false' 2>/dev/null)
    if [ "$success" = "true" ]; then
      echo -e "${GREEN}✅ 成功${NC}"
      PASSED=$((PASSED + 1))
      return 0
    else
      echo -e "${RED}❌ 失败: success=false${NC}"
      echo "$body" | jq '.' 2>/dev/null || echo "$body"
      FAILED=$((FAILED + 1))
      return 1
    fi
  else
    echo -e "${RED}❌ 失败: HTTP $http_code${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# 测试1: 生成方案
echo "测试1: 生成行程骨架方案"
generate_data='{
  "context": {
    "destination": {
      "country": "冰岛"
    },
    "days": 5,
    "travelMode": "self_drive",
    "constraints": {
      "budget": {
        "total": 50000,
        "currency": "CNY"
      },
      "fitness": {
        "level": "medium"
      }
    }
  },
  "userAction": "generate"
}'

if test_api "生成方案（generate）" "POST" "/api/planning-workbench/execute" "$generate_data"; then
  PLAN_ID=$(echo "$body" | jq -r '.data.planState.plan_id' 2>/dev/null)
  SEGMENTS_COUNT=$(echo "$body" | jq -r '.data.planState.itinerary.segments | length' 2>/dev/null)
  HAS_DEM=$(echo "$body" | jq -r '.data.planState.itinerary.segments[] | select(.distanceKm > 0 or .ascentM > 0) | .segmentId' 2>/dev/null | head -1)
  HAS_GEO=$(echo "$body" | jq -r '.data.planState.itinerary.segments[] | select(.metadata.geoFeatures != null) | .segmentId' 2>/dev/null | head -1)
  HAS_EXCLUSION=$(echo "$body" | jq -r '.data.planState.metadata.exclusionLog != null' 2>/dev/null)
  
  echo "   - Plan ID: $PLAN_ID"
  echo "   - Segments: $SEGMENTS_COUNT"
  echo "   - DEM数据填充: $([ -n "$HAS_DEM" ] && echo "✅" || echo "❌")"
  echo "   - 地理特征填充: $([ -n "$HAS_GEO" ] && echo "✅" || echo "❌")"
  echo "   - 排除日志: $([ "$HAS_EXCLUSION" = "true" ] && echo "✅" || echo "❌")"
fi

echo ""

# 测试2: 获取方案详情
if [ -n "$PLAN_ID" ]; then
  echo "测试2: 获取方案详情"
  test_api "获取方案详情" "GET" "/api/planning-workbench/plans/$PLAN_ID" ""
  echo ""
fi

# 测试总结
echo "📊 测试总结"
echo "============================================================"
echo -e "${GREEN}通过: $PASSED${NC}"
echo -e "${RED}失败: $FAILED${NC}"
echo "============================================================"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 所有测试通过！${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  部分测试失败${NC}"
  exit 1
fi
