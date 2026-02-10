#!/bin/bash
# Auto综合 API 测试脚本

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
TRIP_ID="${TRIP_ID:-trip-iceland-froad-1770720249574}"

echo "======================================================================"
echo "Auto综合 API 测试"
echo "======================================================================"
echo ""
echo "API 基础 URL: $API_BASE_URL"
echo "测试 Trip ID: $TRIP_ID"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试 1: 预览模式（推荐，不实际修改数据）
echo -e "${BLUE}测试 1: 预览模式（preview=true）${NC}"
echo "请求: POST $API_BASE_URL/api/planning-workbench/auto-optimize"
echo "Body: {\"tripId\": \"$TRIP_ID\", \"preview\": true, \"limit\": 5}"
echo ""

RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"$TRIP_ID\",
    \"preview\": true,
    \"limit\": 5
  }")

echo "响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# 检查响应
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 测试 1 通过：预览模式成功${NC}"
else
  echo -e "${RED}❌ 测试 1 失败${NC}"
fi

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 测试 2: 默认参数（不设置 preview 和 limit）
echo -e "${BLUE}测试 2: 默认参数（preview=false, limit=10）${NC}"
echo "请求: POST $API_BASE_URL/api/planning-workbench/auto-optimize"
echo "Body: {\"tripId\": \"$TRIP_ID\"}"
echo ""

RESPONSE2=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"$TRIP_ID\"
  }")

echo "响应:"
echo "$RESPONSE2" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE2"
echo ""

# 检查响应
if echo "$RESPONSE2" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 测试 2 通过：默认参数成功${NC}"
else
  echo -e "${RED}❌ 测试 2 失败${NC}"
fi

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 测试 3: 错误处理（无效的 tripId）
echo -e "${BLUE}测试 3: 错误处理（无效的 tripId）${NC}"
echo "请求: POST $API_BASE_URL/api/planning-workbench/auto-optimize"
echo "Body: {\"tripId\": \"invalid-trip-id\"}"
echo ""

RESPONSE3=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"invalid-trip-id\"
  }")

echo "响应:"
echo "$RESPONSE3" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE3"
echo ""

# 检查响应（应该返回错误）
if echo "$RESPONSE3" | grep -q '"success":false'; then
  echo -e "${GREEN}✅ 测试 3 通过：错误处理正常${NC}"
else
  echo -e "${YELLOW}⚠️  测试 3: 未返回预期的错误响应${NC}"
fi

echo ""
echo "======================================================================"
echo "测试完成"
echo "======================================================================"
