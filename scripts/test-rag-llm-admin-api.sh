#!/bin/bash
# RAG 和 LLM 管理 API 测试脚本（Shell 版本）

BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "🚀 开始测试 RAG 和 LLM 管理 API"
echo "📍 目标服务器: ${BASE_URL}"
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
    local url=$3
    local data=$4
    
    echo "🧪 测试: ${name}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${url}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "${method}" \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${BASE_URL}${url}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        success=$(echo "$body" | grep -o '"success":[^,}]*' | cut -d':' -f2 | tr -d ' ')
        if [ "$success" = "true" ]; then
            echo -e "${GREEN}✅ 通过${NC}"
            ((PASSED++))
            return 0
        else
            echo -e "${RED}❌ 失败: success 为 false${NC}"
            echo "响应: $body"
            ((FAILED++))
            return 1
        fi
    else
        echo -e "${RED}❌ 失败: HTTP $http_code${NC}"
        echo "响应: $body"
        ((FAILED++))
        return 1
    fi
}

# 1. RAG 搜索
test_api "RAG 搜索" "POST" "/api/rag/search" '{
  "query": "冰岛旅游攻略",
  "collection": "travel_guides",
  "countryCode": "IS",
  "limit": 5
}'

# 2. RAG 统计（所有集合）
test_api "RAG 统计（所有集合）" "GET" "/api/rag/stats" ""

# 3. RAG 统计（指定集合）
test_api "RAG 统计（指定集合）" "GET" "/api/rag/stats?collection=travel_guides" ""

# 4. 获取可用模型列表
test_api "获取可用模型列表" "GET" "/api/llm/models" ""

# 5. Token 使用统计（总体）
test_api "Token 使用统计（总体）" "GET" "/api/llm/usage" ""

# 6. Token 使用统计（按时间范围）
END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
START_TIME=$(date -u -d "7 days ago" +"%Y-%m-%dT%H:%M:%SZ")
test_api "Token 使用统计（按时间范围）" "GET" "/api/llm/usage?startTime=${START_TIME}&endTime=${END_TIME}" ""

# 7. Token 使用统计（按 Sub-Agent）
test_api "Token 使用统计（按 Sub-Agent）" "GET" "/api/llm/usage?subAgent=PlannerAgent" ""

# 8. Token 使用统计（按 Provider）
test_api "Token 使用统计（按 Provider）" "GET" "/api/llm/usage?provider=deepseek" ""

# 9. 成本统计（总体）
test_api "成本统计（总体）" "GET" "/api/llm/cost" ""

# 10. 成本统计（按时间范围）
test_api "成本统计（按时间范围）" "GET" "/api/llm/cost?startTime=${START_TIME}&endTime=${END_TIME}" ""

# 11. 成本统计（按 Provider）
test_api "成本统计（按 Provider）" "GET" "/api/llm/cost?provider=deepseek" ""

# 12. 成本统计（按 Sub-Agent）
test_api "成本统计（按 Sub-Agent）" "GET" "/api/llm/cost?subAgent=PlannerAgent" ""

# 输出测试结果摘要
echo ""
echo "============================================================"
echo "📊 测试结果摘要"
echo "============================================================"
echo ""
echo "总计: $((PASSED + FAILED)) 个测试"
echo -e "${GREEN}✅ 通过: ${PASSED}${NC}"
echo -e "${RED}❌ 失败: ${FAILED}${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}部分测试失败，请检查服务器是否正常运行${NC}"
    exit 1
else
    echo -e "${GREEN}所有测试通过！${NC}"
    exit 0
fi
