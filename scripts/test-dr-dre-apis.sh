#!/bin/bash
# 测试 Dr.Dre View（节奏tab）使用的接口
# 使用方法: ./scripts/test-dr-dre-apis.sh [TRIP_ID]

TRIP_ID="${1:-6a227a13-b90a-4afb-85fd-d975c38779b7}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}测试 Dr.Dre View（节奏tab）接口${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}📍 API地址: ${API_BASE_URL}${NC}"
echo -e "${YELLOW}🆔 Trip ID: ${TRIP_ID}${NC}"
echo ""

# 测试函数
test_api() {
    local name="$1"
    local url="$2"
    local description="$3"
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}测试: ${name}${NC}"
    echo -e "${BLUE}描述: ${description}${NC}"
    echo -e "${BLUE}URL: GET ${url}${NC}"
    echo ""
    
    response=$(curl -s -w "\n%{http_code}" "${url}")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ 成功 (HTTP ${http_code})${NC}"
        echo ""
        echo "响应数据:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}❌ 失败 (HTTP ${http_code})${NC}"
        echo ""
        echo "错误响应:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    echo ""
}

# 测试1: 获取行程指标
test_api \
    "获取行程指标" \
    "${API_BASE_URL}/api/trips/${TRIP_ID}/metrics" \
    "返回 TripMetricsResponse，包含每天的指标和 conflicts（包含 affectedItemIds），以及汇总指标"

# 测试2: 获取决策日志
test_api \
    "获取决策日志" \
    "${API_BASE_URL}/api/trips/${TRIP_ID}/decision-log?limit=100&offset=0" \
    "返回 DecisionLogResponse，包含决策日志列表，用于提取 Dr.Dre 的 ADJUST 或 PACING_ADJUSTMENT 操作"

# 测试3: 获取决策日志（带过滤条件）
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}测试: 获取决策日志（仅 Dr.Dre 的 ADJUST 操作）${NC}"
echo -e "${BLUE}描述: 过滤出 Dr.Dre 的 ADJUST 或 PACING_ADJUSTMENT 操作${NC}"
echo ""

# 获取决策日志并过滤
response=$(curl -s "${API_BASE_URL}/api/trips/${TRIP_ID}/decision-log?limit=100&offset=0")
http_code=$(curl -s -w "%{http_code}" -o /dev/null "${API_BASE_URL}/api/trips/${TRIP_ID}/decision-log?limit=100&offset=0")

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✅ 成功获取决策日志${NC}"
    echo ""
    
    # 使用 jq 过滤 Dr.Dre 的 ADJUST 操作
    dr_dre_adjusts=$(echo "$response" | jq '.data.items[] | select(.persona == "DR_DRE" and (.action == "ADJUST" or .action == "PACING_ADJUSTMENT"))' 2>/dev/null)
    
    if [ -n "$dr_dre_adjusts" ] && [ "$dr_dre_adjusts" != "null" ]; then
        echo "找到 Dr.Dre 的 ADJUST/PACING_ADJUSTMENT 操作:"
        echo "$dr_dre_adjusts" | jq -s '.'
    else
        echo "未找到 Dr.Dre 的 ADJUST 或 PACING_ADJUSTMENT 操作"
        echo ""
        echo "所有决策日志条目:"
        echo "$response" | jq '.data.items[] | {id, date, persona, action, description}' 2>/dev/null || echo "$response" | jq '.data.items' 2>/dev/null
    fi
else
    echo -e "${RED}❌ 获取决策日志失败 (HTTP ${http_code})${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}测试完成${NC}"
echo -e "${BLUE}========================================${NC}"
