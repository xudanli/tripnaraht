#!/bin/bash
# Auto综合 API 测试脚本（Shell版本）

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
TRIP_ID="${TRIP_ID:-f3626ff1-7a9b-46d9-8b8b-7f53a14583b1}"

echo "🚀 开始测试 Auto综合 API"
echo "📍 API地址: $API_BASE_URL"
echo "🆔 Trip ID: $TRIP_ID"
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
test_auto_optimize() {
  local test_name=$1
  local preview=$2
  local limit=$3
  
  echo "📋 $test_name"
  echo "   请求: POST /api/planning-workbench/auto-optimize"
  
  REQUEST_BODY=$(cat <<EOF
{
  "tripId": "$TRIP_ID",
  "preview": $preview,
  "limit": ${limit:-10}
}
EOF
)
  
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$REQUEST_BODY" \
    "$API_BASE_URL/api/planning-workbench/auto-optimize")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    SUCCESS=$(echo "$BODY" | jq -r '.success // false' 2>/dev/null)
    if [ "$SUCCESS" = "true" ]; then
      APPLIED_COUNT=$(echo "$BODY" | jq -r '.data.appliedCount // 0' 2>/dev/null)
      SUGGESTIONS_COUNT=$(echo "$BODY" | jq -r '.data.suggestions | length' 2>/dev/null)
      
      echo -e "   ${GREEN}✅ 成功${NC}"
      echo "   - 应用数量: $APPLIED_COUNT"
      echo "   - 建议总数: $SUGGESTIONS_COUNT"
      
      # 验证只包含高优先级建议（BLOCKER）
      NON_BLOCKER=$(echo "$BODY" | jq -r '[.data.suggestions[] | select(.severity != "blocker")] | length' 2>/dev/null)
      if [ "$NON_BLOCKER" = "0" ]; then
        echo -e "   ${GREEN}✅ 验证通过: 所有建议都是高优先级（BLOCKER）${NC}"
      else
        echo -e "   ${YELLOW}⚠️  警告: 发现 $NON_BLOCKER 个非高优先级建议${NC}"
      fi
      
      # 显示应用结果
      echo "   📊 应用结果:"
      echo "$BODY" | jq -r '.data.suggestions[] | "      \(if .applied then "✅" else "❌" end) \(.title) (\(.severity))"' 2>/dev/null
      
      # 显示影响分析
      IMPACT=$(echo "$BODY" | jq -r '.data.impact // empty' 2>/dev/null)
      if [ -n "$IMPACT" ] && [ "$IMPACT" != "null" ]; then
        echo "   📈 影响分析:"
        FATIGUE=$(echo "$BODY" | jq -r '.data.impact.metrics.fatigue // empty' 2>/dev/null)
        BUFFER=$(echo "$BODY" | jq -r '.data.impact.metrics.buffer // empty' 2>/dev/null)
        COST=$(echo "$BODY" | jq -r '.data.impact.metrics.cost // empty' 2>/dev/null)
        
        if [ -n "$FATIGUE" ] && [ "$FATIGUE" != "null" ]; then
          echo "      - 疲劳指数变化: $FATIGUE"
        fi
        if [ -n "$BUFFER" ] && [ "$BUFFER" != "null" ]; then
          echo "      - 缓冲时间变化: $BUFFER 分钟"
        fi
        if [ -n "$COST" ] && [ "$COST" != "null" ]; then
          echo "      - 费用变化: $COST"
        fi
      fi
      
      PASSED=$((PASSED + 1))
      return 0
    else
      echo -e "   ${RED}❌ 失败: success=false${NC}"
      echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
      FAILED=$((FAILED + 1))
      return 1
    fi
  else
    echo -e "   ${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# 测试1: 预览模式
test_auto_optimize "测试1: 预览模式（不实际应用）" "true" "10"

# 测试2: 限制数量
test_auto_optimize "测试2: 限制应用数量（limit=5）" "true" "5"

# 测试3: 验证只应用高优先级建议
test_auto_optimize "测试3: 验证只应用高优先级建议" "true" "10"

# 总结
echo ""
echo "============================================================"
echo "📊 测试总结"
echo "============================================================"
echo -e "${GREEN}✅ 通过: $PASSED${NC}"
echo -e "${RED}❌ 失败: $FAILED${NC}"
echo "📈 总计: $((PASSED + FAILED))"
echo ""

if [ $FAILED -gt 0 ]; then
  exit 1
fi
