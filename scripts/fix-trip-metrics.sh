#!/bin/bash
# 修复行程指标数据为空的问题
# 使用方法: ./scripts/fix-trip-metrics.sh <trip-id>

TRIP_ID="${1:-9a4dbd2e-e76a-4fd3-bab0-09332fb2581b}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}修复行程指标数据${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}📍 API地址: ${API_BASE_URL}${NC}"
echo -e "${YELLOW}🆔 Trip ID: ${TRIP_ID}${NC}"
echo ""

# 1. 获取行程信息
echo -e "${YELLOW}步骤1: 获取行程信息...${NC}"
TRIP_RESPONSE=$(curl -s "${API_BASE_URL}/api/trips/${TRIP_ID}")
TRIP_DATA=$(echo "$TRIP_RESPONSE" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin)['data']))" 2>/dev/null)

if [ -z "$TRIP_DATA" ]; then
    echo -e "${RED}❌ 无法获取行程信息${NC}"
    exit 1
fi

# 提取 day IDs
DAY_IDS=$(echo "$TRIP_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
days = data.get('TripDay', [])
for day in days:
    print(day['id'])
" 2>/dev/null)

if [ -z "$DAY_IDS" ]; then
    echo -e "${RED}❌ 未找到行程日期${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 找到 $(echo "$DAY_IDS" | wc -l) 个行程日期${NC}"
echo ""

# 2. 为每个日期计算交通信息
echo -e "${YELLOW}步骤2: 计算交通信息...${NC}"
SUCCESS_COUNT=0
FAIL_COUNT=0

for DAY_ID in $DAY_IDS; do
    echo -n "  处理日期 ${DAY_ID}... "
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"defaultTravelMode": "DRIVING"}' \
        "${API_BASE_URL}/api/itinerary-items/trip/${TRIP_ID}/days/${DAY_ID}/calculate-travel")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        CALCULATED=$(echo "$BODY" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data', {}).get('calculatedCount', 0))" 2>/dev/null)
        echo -e "${GREEN}✅ (计算了 ${CALCULATED} 个交通信息)${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "${RED}❌ (HTTP ${HTTP_CODE})${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo ""
echo -e "${GREEN}成功: ${SUCCESS_COUNT} 个日期${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}失败: ${FAIL_COUNT} 个日期${NC}"
fi
echo ""

# 3. 重新获取指标数据
echo -e "${YELLOW}步骤3: 验证修复结果...${NC}"
METRICS_RESPONSE=$(curl -s "${API_BASE_URL}/api/trips/${TRIP_ID}/metrics")
METRICS_DATA=$(echo "$METRICS_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin).get('data', {})
summary = data.get('summary', {})
print(f\"总步行距离: {summary.get('totalWalk', 0)} km\")
print(f\"总车程: {summary.get('totalDrive', 0)} 分钟\")
print(f\"总缓冲时间: {summary.get('totalBuffer', 0)} 分钟\")
print(f\"总疲劳指数: {summary.get('totalFatigue', 0)}\")
print(f\"总花费: {summary.get('totalCost', 0)}\")
" 2>/dev/null)

if [ -n "$METRICS_DATA" ]; then
    echo "$METRICS_DATA"
else
    echo -e "${RED}❌ 无法获取指标数据${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}修复完成${NC}"
echo -e "${BLUE}========================================${NC}"
