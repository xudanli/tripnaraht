#!/bin/bash

# 执行页面接口测试脚本
# 使用方法: ./scripts/test-execution-apis.sh [BASE_URL]
# 示例: ./scripts/test-execution-apis.sh http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试用的ID（需要替换为实际的ID）
TRIP_ID="${TRIP_ID:-trip-uuid-123}"
DAY_ID="${DAY_ID:-day-uuid-456}"
ITEM_ID="${ITEM_ID:-item-uuid-789}"
PLACE_ID="${PLACE_ID:-123}"
SOLUTION_ID="${SOLUTION_ID:-solution-uuid-456}"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}执行页面接口测试${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    
    echo -e "${YELLOW}测试: ${name}${NC}"
    echo "URL: ${method} ${url}"
    if [ -n "$data" ]; then
        echo "Data: ${data}"
    fi
    echo ""
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "${url}" \
            -H "Content-Type: application/json")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "${url}" \
            -H "Content-Type: application/json" \
            -d "${data}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ 成功 (HTTP ${http_code})${NC}"
        echo "响应:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}✗ 失败 (HTTP ${http_code})${NC}"
        echo "响应:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    echo ""
    echo "----------------------------------------"
    echo ""
}

# 1. 获取行程状态（增强）
test_api \
    "获取行程状态（增强）" \
    "GET" \
    "${API_BASE}/trips/${TRIP_ID}/state?now=2026-02-05T09:30:00Z"

# 2. 获取提醒列表
test_api \
    "获取提醒列表" \
    "POST" \
    "${API_BASE}/execution/execute" \
    "{
        \"tripId\": \"${TRIP_ID}\",
        \"action\": \"remind\",
        \"remindParams\": {
            \"reminderTypes\": [\"departure\", \"transport\", \"weather\"],
            \"advanceHours\": 24
        }
    }"

# 3. 处理变更（延迟）
test_api \
    "处理变更（延迟）" \
    "POST" \
    "${API_BASE}/execution/execute" \
    "{
        \"tripId\": \"${TRIP_ID}\",
        \"action\": \"handle_change\",
        \"changeParams\": {
            \"changeType\": \"schedule_change\",
            \"changeDetails\": {
                \"reason\": \"用户请求延迟15分钟\",
                \"delayMinutes\": 15,
                \"itemId\": \"${ITEM_ID}\"
            }
        }
    }"

# 4. 处理变更（跳过）
test_api \
    "处理变更（跳过）" \
    "POST" \
    "${API_BASE}/execution/execute" \
    "{
        \"tripId\": \"${TRIP_ID}\",
        \"action\": \"handle_change\",
        \"changeParams\": {
            \"changeType\": \"activity_cancelled\",
            \"changeDetails\": {
                \"reason\": \"用户请求跳过当前活动\",
                \"itemId\": \"${ITEM_ID}\"
            }
        }
    }"

# 5. 触发修复（替换）
test_api \
    "触发修复（替换）" \
    "POST" \
    "${API_BASE}/execution/execute" \
    "{
        \"tripId\": \"${TRIP_ID}\",
        \"action\": \"fallback\",
        \"fallbackParams\": {
            \"triggerReason\": \"用户请求替换当前活动\",
            \"itemId\": \"${ITEM_ID}\",
            \"originalPlan\": {}
        }
    }"

# 6. 重新排序行程
test_api \
    "重新排序行程" \
    "POST" \
    "${API_BASE}/execution/reorder" \
    "{
        \"tripId\": \"${TRIP_ID}\",
        \"dayId\": \"${DAY_ID}\",
        \"newOrder\": [\"item-uuid-3\", \"item-uuid-1\", \"item-uuid-2\"],
        \"reason\": \"用户请求调整顺序\"
    }"

# 7. 获取关键证据
test_api \
    "获取关键证据" \
    "GET" \
    "${API_BASE}/places/${PLACE_ID}/evidence?date=2026-02-05&includeWeather=true&includeTraffic=true"

# 8. 应用修复方案（需要先执行fallback获取solutionId）
echo -e "${YELLOW}注意: 应用修复方案需要先执行fallback操作获取solutionId${NC}"
test_api \
    "应用修复方案" \
    "POST" \
    "${API_BASE}/execution/apply-fallback" \
    "{
        \"tripId\": \"${TRIP_ID}\",
        \"solutionId\": \"${SOLUTION_ID}\",
        \"confirm\": true
    }"

# 9. 预览修复方案（需要先执行fallback获取solutionId）
echo -e "${YELLOW}注意: 预览修复方案需要先执行fallback操作获取solutionId${NC}"
test_api \
    "预览修复方案" \
    "GET" \
    "${API_BASE}/execution/fallback/${SOLUTION_ID}/preview"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}测试完成${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "提示:"
echo "1. 请确保服务已启动: npm run start:dev"
echo "2. 请替换脚本中的 TRIP_ID, DAY_ID, ITEM_ID, PLACE_ID 为实际值"
echo "3. 可以通过环境变量设置: export TRIP_ID=your-trip-id"
echo "4. fallback相关的接口需要先执行fallback操作获取solutionId"
