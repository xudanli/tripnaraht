#!/bin/bash

# Decision Layer API 测试脚本

BASE_URL="http://localhost:3000/decision"

echo "🧪 Testing Decision Layer API"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${YELLOW}Testing: ${description}${NC}"
    echo "Endpoint: ${method} ${endpoint}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "${method}" \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${BASE_URL}${endpoint}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ Success (HTTP ${http_code})${NC}"
        echo "Response: $(echo "$body" | jq -c '.' 2>/dev/null || echo "$body")"
    else
        echo -e "${RED}✗ Failed (HTTP ${http_code})${NC}"
        echo "Response: $body"
    fi
    echo ""
}

# 1. 测试生成计划
echo "1️⃣  Testing Generate Plan"
test_endpoint "POST" "/generate-plan" '{
  "state": {
    "context": {
      "destination": "IS",
      "startDate": "2026-01-02",
      "durationDays": 1,
      "preferences": {
        "intents": { "nature": 0.8 },
        "pace": "moderate",
        "riskTolerance": "medium"
      }
    },
    "candidatesByDate": {},
    "signals": {
      "lastUpdatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}' "Generate Plan"

# 2. 测试获取监控指标
echo "2️⃣  Testing Monitoring Metrics"
test_endpoint "GET" "/monitoring/metrics" "" "Get Monitoring Metrics"

# 3. 测试获取告警
echo "3️⃣  Testing Alerts"
test_endpoint "GET" "/monitoring/alerts" "" "Get Alerts"

echo "================================"
echo "✅ Test completed!"
echo ""
echo "📚 Swagger UI: http://localhost:3000/api"
echo "🔍 Find 'decision' tag to see all endpoints"

