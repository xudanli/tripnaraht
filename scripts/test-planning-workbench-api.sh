#!/bin/bash
# 测试规划工作台 API 接口

BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"
TEST_TRIP_ID="test-trip-123"
TEST_PLAN_ID="plan_1234567890"

echo "🚀 开始测试规划工作台 API 接口"
echo "📍 基础 URL: ${BASE_URL}"
echo ""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success_count=0
fail_count=0

# 测试函数
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    echo -e "\n🧪 测试: ${name}"
    echo "   ${method} ${url}"
    
    if [ -n "$data" ]; then
        echo "   请求体: ${data}"
        response=$(curl -s -w "\n%{http_code}" -X ${method} \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${BASE_URL}${url}")
    else
        response=$(curl -s -w "\n%{http_code}" -X ${method} \
            -H "Content-Type: application/json" \
            "${BASE_URL}${url}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "   ${GREEN}✅ 状态码: ${http_code}${NC}"
        echo "   📦 响应: $(echo "$body" | head -c 200)..."
        ((success_count++))
        return 0
    else
        echo -e "   ${RED}❌ 状态码: ${http_code}${NC}"
        echo "   📦 响应: $(echo "$body" | head -c 200)..."
        ((fail_count++))
        return 1
    fi
}

# 1. 测试获取行程工作台数据
test_endpoint \
    "GET /planning-workbench/trips/:tripId" \
    "GET" \
    "/planning-workbench/trips/${TEST_TRIP_ID}"

# 2. 测试获取方案列表
test_endpoint \
    "GET /planning-workbench/trips/:tripId/plans" \
    "GET" \
    "/planning-workbench/trips/${TEST_TRIP_ID}/plans?limit=10&offset=0"

# 3. 测试获取方案详情
test_endpoint \
    "GET /planning-workbench/plans/:planId" \
    "GET" \
    "/planning-workbench/plans/${TEST_PLAN_ID}"

# 4. 测试对比方案
test_endpoint \
    "POST /planning-workbench/plans/compare" \
    "POST" \
    "/planning-workbench/plans/compare" \
    '{"planIds":["'${TEST_PLAN_ID}'","plan_0987654321"],"compareFields":["budget.total","constraints.time.days"]}'

# 5. 测试调整方案
test_endpoint \
    "POST /planning-workbench/plans/:planId/adjust" \
    "POST" \
    "/planning-workbench/plans/${TEST_PLAN_ID}/adjust" \
    '{"adjustments":[{"type":"modify_budget","data":{"total":10000}}],"regenerate":false}'

# 6. 测试预算评估
test_endpoint \
    "POST /planning-workbench/budget/evaluate" \
    "POST" \
    "/planning-workbench/budget/evaluate" \
    '{"planId":"'${TEST_PLAN_ID}'","tripId":"'${TEST_TRIP_ID}'","estimatedCost":8000,"categoryBreakdown":{"accommodation":3000,"transportation":2000,"food":1500,"activities":1000,"other":500},"budgetConstraint":{"total":10000,"currency":"CNY","dailyBudget":1000,"categoryLimits":{},"alertThreshold":0.9}}'

# 7. 测试获取预算决策日志
test_endpoint \
    "GET /planning-workbench/budget/decision-log" \
    "GET" \
    "/planning-workbench/budget/decision-log?planId=${TEST_PLAN_ID}&tripId=${TEST_TRIP_ID}&limit=10&offset=0"

# 8. 测试获取方案预算评估结果
test_endpoint \
    "GET /planning-workbench/plans/:planId/budget-evaluation" \
    "GET" \
    "/planning-workbench/plans/${TEST_PLAN_ID}/budget-evaluation?tripId=${TEST_TRIP_ID}"

# 9. 测试应用预算优化建议
test_endpoint \
    "POST /planning-workbench/budget/apply-optimization" \
    "POST" \
    "/planning-workbench/budget/apply-optimization" \
    '{"planId":"'${TEST_PLAN_ID}'","tripId":"'${TEST_TRIP_ID}'","optimizationIds":["opt_1","opt_2"],"autoCommit":false}'

# 打印测试结果摘要
echo ""
echo "============================================================"
echo "📊 测试结果摘要"
echo "============================================================"
echo -e "${GREEN}✅ 成功: ${success_count}${NC}"
echo -e "${RED}❌ 失败: ${fail_count}${NC}"
echo "============================================================"
echo ""

exit $fail_count
