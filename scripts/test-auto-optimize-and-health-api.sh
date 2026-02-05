#!/bin/bash

# 测试 Auto综合 API 和健康度接口
#
# 使用方法:
#   bash scripts/test-auto-optimize-and-health-api.sh
#
# 环境变量:
#   API_BASE_URL - API 基础 URL (默认: http://localhost:3000)
#   TRIP_ID - 行程 ID (必需)

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
TRIP_ID="${TRIP_ID:-}"

echo "🧪 Auto综合 API 和健康度接口测试"
echo "============================================================"
echo "API 基础 URL: $API_BASE_URL"
echo "行程 ID: ${TRIP_ID:-'(未设置，请设置 TRIP_ID 环境变量)'}"
echo ""

if [ -z "$TRIP_ID" ]; then
  echo "❌ 错误: 请设置 TRIP_ID 环境变量"
  echo "使用方法:"
  echo "  export TRIP_ID=your-trip-id"
  echo "  bash scripts/test-auto-optimize-and-health-api.sh"
  exit 1
fi

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试健康度接口
echo ""
echo "📊 测试健康度接口"
echo "============================================================"
echo "GET $API_BASE_URL/api/trip-detail/$TRIP_ID/health"
echo ""

HEALTH_RESPONSE=$(curl -s -X GET "$API_BASE_URL/api/trip-detail/$TRIP_ID/health" \
  -H "Content-Type: application/json")

# 检查是否包含 success:true
if echo "$HEALTH_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 健康度接口调用成功${NC}"
  echo ""
  echo "健康度数据:"
  echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
  
  # 提取关键信息（使用 grep 和 sed）
  OVERALL=$(echo "$HEALTH_RESPONSE" | grep -o '"overall":"[^"]*"' | sed 's/"overall":"\([^"]*\)"/\1/' || echo "unknown")
  echo ""
  echo "总体健康度: $OVERALL"
  
  echo ""
  echo "各维度健康度:"
  echo "$HEALTH_RESPONSE" | grep -o '"schedule":{[^}]*}' | grep -o '"status":"[^"]*"' | sed 's/"status":"\([^"]*\)"/  - schedule: \1/' || true
  echo "$HEALTH_RESPONSE" | grep -o '"budget":{[^}]*}' | grep -o '"status":"[^"]*"' | sed 's/"status":"\([^"]*\)"/  - budget: \1/' || true
  echo "$HEALTH_RESPONSE" | grep -o '"pace":{[^}]*}' | grep -o '"status":"[^"]*"' | sed 's/"status":"\([^"]*\)"/  - pace: \1/' || true
  echo "$HEALTH_RESPONSE" | grep -o '"feasibility":{[^}]*}' | grep -o '"status":"[^"]*"' | sed 's/"status":"\([^"]*\)"/  - feasibility: \1/' || true
else
  echo -e "${RED}❌ 健康度接口调用失败${NC}"
  echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
fi

# 测试 Auto综合 API - 预览模式
echo ""
echo "🔍 测试 Auto综合 API (预览模式)"
echo "============================================================"
echo "POST $API_BASE_URL/api/planning-workbench/auto-optimize"
echo ""

AUTO_OPTIMIZE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"$TRIP_ID\",
    \"preview\": true,
    \"limit\": 10
  }")

# 检查是否包含 success:true
if echo "$AUTO_OPTIMIZE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Auto综合 API (预览模式) 调用成功${NC}"
  echo ""
  echo "预览结果:"
  echo "$AUTO_OPTIMIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTO_OPTIMIZE_RESPONSE"
  
  # 提取关键信息
  APPLIED_COUNT=$(echo "$AUTO_OPTIMIZE_RESPONSE" | grep -o '"appliedCount":[0-9]*' | grep -o '[0-9]*' || echo "0")
  echo ""
  echo "将应用的建议数量: $APPLIED_COUNT"
  
  # 提取建议列表（简化版）
  if echo "$AUTO_OPTIMIZE_RESPONSE" | grep -q '"suggestions"'; then
    echo ""
    echo "建议列表:"
    echo "$AUTO_OPTIMIZE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'data' in data and 'suggestions' in data['data']:
        for i, s in enumerate(data['data']['suggestions'], 1):
            severity = s.get('severity', 'unknown')
            title = s.get('title', 'N/A')
            print(f'  {i}. [{severity}] {title}')
except:
    pass
" 2>/dev/null || echo "  (无法解析建议列表)"
  fi
else
  echo -e "${RED}❌ Auto综合 API (预览模式) 调用失败${NC}"
  echo "$AUTO_OPTIMIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTO_OPTIMIZE_RESPONSE"
fi

# 提示实际应用模式
echo ""
echo -e "${YELLOW}⚠️  跳过实际应用模式测试（避免修改数据）${NC}"
echo "如需测试实际应用，请手动调用:"
echo "  curl -X POST \"$API_BASE_URL/api/planning-workbench/auto-optimize\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"tripId\": \"$TRIP_ID\", \"preview\": false, \"limit\": 10}'"

echo ""
echo "============================================================"
echo -e "${GREEN}✅ 测试完成${NC}"
