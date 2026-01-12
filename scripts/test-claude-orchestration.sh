#!/bin/bash

# Claude 编排功能测试脚本

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_URL="${BASE_URL}/api/agent/route_and_run"

echo "=========================================="
echo "Claude 编排功能测试"
echo "=========================================="
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
test_request() {
  local test_name="$1"
  local request_body="$2"
  local expected_status="${3:-OK}"
  
  echo -e "${YELLOW}测试: ${test_name}${NC}"
  echo "请求: ${request_body}"
  echo ""
  
  response=$(curl -s -X POST "${API_URL}" \
    -H "Content-Type: application/json" \
    -d "${request_body}" \
    -w "\nHTTP_STATUS:%{http_code}")
  
  http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
  body=$(echo "$response" | sed '/HTTP_STATUS/d')
  
  echo "HTTP 状态码: ${http_status}"
  
  if [ "$http_status" != "200" ]; then
    echo -e "${RED}❌ 失败: HTTP 状态码 ${http_status}${NC}"
    echo "响应: ${body}"
    FAILED=$((FAILED + 1))
    echo ""
    return 1
  fi
  
  # 检查响应中的状态
  result_status=$(echo "$body" | jq -r '.result.status // "UNKNOWN"' 2>/dev/null)
  route_type=$(echo "$body" | jq -r '.route.route // "UNKNOWN"' 2>/dev/null)
  system_mode=$(echo "$body" | jq -r '.observability.system_mode // "UNKNOWN"' 2>/dev/null)
  
  echo "结果状态: ${result_status}"
  echo "路由类型: ${route_type}"
  echo "系统模式: ${system_mode}"
  
  if [ "$result_status" = "$expected_status" ]; then
    echo -e "${GREEN}✅ 通过${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ 失败: 期望状态 ${expected_status}, 实际状态 ${result_status}${NC}"
    FAILED=$((FAILED + 1))
  fi
  
  echo ""
  echo "完整响应:"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
  echo ""
  echo "----------------------------------------"
  echo ""
}

# 测试 1: 简单查询（应该走 System 1）
echo "=========================================="
echo "测试 1: 简单查询（System 1 路径）"
echo "=========================================="
test_request "简单查询" '{
  "request_id": "test-simple-001",
  "user_id": "user-123",
  "message": "查询我的行程",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "anthropic"
  }
}' "OK"

# 测试 2: 复杂分析请求（应该走 System 2）
echo "=========================================="
echo "测试 2: 复杂分析请求（System 2 路径）"
echo "=========================================="
test_request "复杂分析请求" '{
  "request_id": "test-analysis-001",
  "user_id": "user-123",
  "message": "分析 TripNARA 的市场机会",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "anthropic"
  }
}' "OK"

# 测试 3: PEST 分析请求
echo "=========================================="
echo "测试 3: PEST 分析请求"
echo "=========================================="
test_request "PEST 分析请求" '{
  "request_id": "test-pest-001",
  "user_id": "user-123",
  "message": "/分析 TripNARA（决策型旅行应用）— 面向全球市场",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "anthropic"
  }
}' "OK"

# 测试 4: 行程规划请求
echo "=========================================="
echo "测试 4: 行程规划请求"
echo "=========================================="
test_request "行程规划请求" '{
  "request_id": "test-planning-001",
  "user_id": "user-123",
  "message": "我想在7月去冰岛，但我膝盖不好，不想太累",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "anthropic"
  }
}' "OK"

# 测试 5: 需要更多信息的请求
echo "=========================================="
echo "测试 5: 模糊请求（可能需要更多信息）"
echo "=========================================="
test_request "模糊请求" '{
  "request_id": "test-ambiguous-001",
  "user_id": "user-123",
  "message": "帮我改一下",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "anthropic"
  }
}' "NEED_MORE_INFO"

# 汇总结果
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo -e "${GREEN}通过: ${PASSED}${NC}"
echo -e "${RED}失败: ${FAILED}${NC}"
echo "总计: $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ 所有测试通过！${NC}"
  exit 0
else
  echo -e "${RED}❌ 有 ${FAILED} 个测试失败${NC}"
  exit 1
fi
