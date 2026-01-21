#!/bin/bash

# 简单的 curl 测试脚本

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_URL="${BASE_URL}/planning-workbench"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "规划工作台提交方案接口测试 (curl)"
echo "=========================================="
echo ""

# 检查服务器是否运行
echo -e "${BLUE}检查服务器状态...${NC}"
if ! curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ 服务器未运行，请先启动服务器:${NC}"
  echo "  npm run dev"
  exit 1
fi
echo -e "${GREEN}✅ 服务器运行中${NC}"
echo ""

# 提示用户输入测试数据
echo -e "${YELLOW}请输入测试数据:${NC}"
read -p "Plan ID: " PLAN_ID
read -p "Trip ID: " TRIP_ID

if [ -z "$PLAN_ID" ] || [ -z "$TRIP_ID" ]; then
  echo -e "${RED}❌ Plan ID 和 Trip ID 不能为空${NC}"
  exit 1
fi

echo ""
echo "=========================================="
echo "测试 1: 全量提交"
echo "=========================================="
echo ""

response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_URL}/plans/${PLAN_ID}/commit" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"${TRIP_ID}\",
    \"options\": {}
  }")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "HTTP 状态码: ${http_status}"
echo "响应:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

if [ "$http_status" = "200" ]; then
  echo -e "${GREEN}✅ 测试通过${NC}"
else
  echo -e "${RED}❌ 测试失败${NC}"
fi

echo ""
echo "=========================================="
echo "测试 2: 部分提交（第1、2天）"
echo "=========================================="
echo ""

response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_URL}/plans/${PLAN_ID}/commit" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"${TRIP_ID}\",
    \"options\": {
      \"partialCommit\": true,
      \"commitDays\": [1, 2]
    }
  }")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "HTTP 状态码: ${http_status}"
echo "响应:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

if [ "$http_status" = "200" ]; then
  echo -e "${GREEN}✅ 测试通过${NC}"
else
  echo -e "${RED}❌ 测试失败${NC}"
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
