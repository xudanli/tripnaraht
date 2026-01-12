#!/bin/bash

# Claude 编排快速测试脚本

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_URL="${BASE_URL}/api/agent/route_and_run"

echo "=========================================="
echo "Claude 编排快速测试"
echo "=========================================="
echo ""

# 检查服务是否运行
echo "1. 检查服务状态..."
status=$(curl -s "${BASE_URL}/api/system/status" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$status" ]; then
  echo "❌ 服务未运行或无法访问"
  echo "   请确保服务已启动: npm run dev"
  exit 1
fi

llm_provider=$(echo "$status" | jq -r '.data.llmProvider // "unknown"' 2>/dev/null)
echo "   LLM Provider: ${llm_provider}"

if [ "$llm_provider" != "anthropic" ]; then
  echo "⚠️  警告: LLM Provider 不是 'anthropic'"
  echo "   请检查 ANTHROPIC_API_KEY 是否已配置"
fi

echo ""
echo "2. 测试简单请求（启用 Claude 编排）..."
echo ""

request_body='{
  "request_id": "test-claude-quick-001",
  "user_id": "user-123",
  "message": "你好，测试 Claude 编排",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "anthropic"
  }
}'

echo "请求:"
echo "$request_body" | jq '.' 2>/dev/null || echo "$request_body"
echo ""

response=$(curl -s -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -d "${request_body}" \
  -w "\nHTTP_STATUS:%{http_code}")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "响应:"
echo "HTTP 状态码: ${http_status}"
echo ""

if [ "$http_status" = "200" ]; then
  echo "✅ 请求成功"
  echo ""
  echo "结果摘要:"
  echo "$body" | jq '{
    request_id: .request_id,
    route: .route.route,
    system_mode: .observability.system_mode,
    result_status: .result.status,
    answer_text_preview: (.result.answer_text | .[0:100]),
    tool_calls: .observability.tool_calls,
    latency_ms: .observability.latency_ms,
    cost_est_usd: .observability.cost_est_usd
  }' 2>/dev/null || echo "$body"
  
  echo ""
  echo "决策日志:"
  echo "$body" | jq '.explain.decision_log[]? | "\(.step): \(.decision) - \(.reasoning)"' 2>/dev/null || echo "无决策日志"
  
  echo ""
  echo "✅ 测试完成"
else
  echo "❌ 请求失败"
  echo "响应: $body"
  exit 1
fi
