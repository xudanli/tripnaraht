#!/bin/bash

# Claude 编排诊断脚本

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=========================================="
echo "Claude 编排诊断工具"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 检查服务状态
echo -e "${BLUE}1. 检查服务状态...${NC}"
status=$(curl -s "${BASE_URL}/api/system/status" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$status" ]; then
  echo -e "${RED}❌ 服务未运行或无法访问${NC}"
  exit 1
fi
echo -e "${GREEN}✅ 服务运行正常${NC}"
echo ""

# 2. 检查环境变量
echo -e "${BLUE}2. 检查环境变量配置...${NC}"
if [ -f .env ]; then
  if grep -q "USE_CLAUDE_ORCHESTRATION" .env; then
    claude_flag=$(grep "USE_CLAUDE_ORCHESTRATION" .env | tail -1 | cut -d= -f2 | tr -d '"')
    echo "   USE_CLAUDE_ORCHESTRATION: ${claude_flag}"
    if [ "$claude_flag" = "true" ]; then
      echo -e "${GREEN}✅ Claude 编排已启用（环境变量）${NC}"
    else
      echo -e "${YELLOW}⚠️  Claude 编排未启用（环境变量）${NC}"
    fi
  else
    echo -e "${YELLOW}⚠️  USE_CLAUDE_ORCHESTRATION 未配置${NC}"
  fi
  
  if grep -q "ANTHROPIC_API_KEY" .env; then
    api_key=$(grep "ANTHROPIC_API_KEY" .env | tail -1 | cut -d= -f2)
    if [ -n "$api_key" ] && [ "$api_key" != "" ]; then
      key_preview="${api_key:0:20}..."
      echo "   ANTHROPIC_API_KEY: ${key_preview}"
      echo -e "${GREEN}✅ API Key 已配置${NC}"
    else
      echo -e "${RED}❌ API Key 为空${NC}"
    fi
  else
    echo -e "${RED}❌ ANTHROPIC_API_KEY 未配置${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  .env 文件不存在${NC}"
fi
echo ""

# 3. 测试简单请求（不使用 Claude 编排）
echo -e "${BLUE}3. 测试基础路由（不使用 Claude 编排）...${NC}"
response1=$(curl -s -X POST "${BASE_URL}/api/agent/route_and_run" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "diagnose-basic-001",
    "user_id": "user-123",
    "message": "查询我的行程",
    "options": {
      "use_claude_orchestration": false
    }
  }')

route1=$(echo "$response1" | jq -r '.route.route // "UNKNOWN"' 2>/dev/null)
status1=$(echo "$response1" | jq -r '.result.status // "UNKNOWN"' 2>/dev/null)

if [ "$status1" = "OK" ] || [ "$status1" = "NEED_MORE_INFO" ]; then
  echo -e "${GREEN}✅ 基础路由正常: ${route1}, 状态: ${status1}${NC}"
else
  echo -e "${RED}❌ 基础路由异常: ${route1}, 状态: ${status1}${NC}"
fi
echo ""

# 4. 测试 Claude 编排（简单请求）
echo -e "${BLUE}4. 测试 Claude 编排（简单请求）...${NC}"
response2=$(curl -s -X POST "${BASE_URL}/api/agent/route_and_run" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "diagnose-claude-001",
    "user_id": "user-123",
    "message": "查询我的行程",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }')

route2=$(echo "$response2" | jq -r '.route.route // "UNKNOWN"' 2>/dev/null)
system_mode2=$(echo "$response2" | jq -r '.observability.system_mode // "UNKNOWN"' 2>/dev/null)
status2=$(echo "$response2" | jq -r '.result.status // "UNKNOWN"' 2>/dev/null)
decision_log2=$(echo "$response2" | jq -r '.explain.decision_log | length' 2>/dev/null)
reasons2=$(echo "$response2" | jq -r '.route.reasons[]?' 2>/dev/null | head -1)

echo "   路由: ${route2}"
echo "   系统模式: ${system_mode2}"
echo "   状态: ${status2}"
echo "   决策日志条目: ${decision_log2}"
echo "   决策原因: ${reasons2}"

if [ "$reasons2" = "LLM_DECISION" ]; then
  echo -e "${GREEN}✅ Claude 编排已触发（LLM_DECISION）${NC}"
else
  echo -e "${YELLOW}⚠️  Claude 编排可能未触发（原因: ${reasons2}）${NC}"
fi

if [ "$decision_log2" -gt 0 ]; then
  echo -e "${GREEN}✅ 决策日志已生成${NC}"
else
  echo -e "${YELLOW}⚠️  决策日志为空${NC}"
fi
echo ""

# 5. 测试 Claude 编排（复杂请求）
echo -e "${BLUE}5. 测试 Claude 编排（复杂分析请求）...${NC}"
response3=$(curl -s -X POST "${BASE_URL}/api/agent/route_and_run" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "diagnose-claude-002",
    "user_id": "user-123",
    "message": "分析 TripNARA 的市场机会和竞争格局",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }')

route3=$(echo "$response3" | jq -r '.route.route // "UNKNOWN"' 2>/dev/null)
system_mode3=$(echo "$response3" | jq -r '.observability.system_mode // "UNKNOWN"' 2>/dev/null)
status3=$(echo "$response3" | jq -r '.result.status // "UNKNOWN"' 2>/dev/null)
answer_text3=$(echo "$response3" | jq -r '.result.answer_text // ""' 2>/dev/null | head -c 100)
tool_calls3=$(echo "$response3" | jq -r '.observability.tool_calls // 0' 2>/dev/null)
decision_log3=$(echo "$response3" | jq -r '.explain.decision_log | length' 2>/dev/null)

echo "   路由: ${route3}"
echo "   系统模式: ${system_mode3}"
echo "   状态: ${status3}"
echo "   工具调用: ${tool_calls3}"
echo "   决策日志条目: ${decision_log3}"
echo "   回答预览: ${answer_text3}..."

if [ "$system_mode3" = "SYSTEM2" ]; then
  echo -e "${GREEN}✅ 正确路由到 System 2${NC}"
else
  echo -e "${YELLOW}⚠️  未路由到 System 2（实际: ${system_mode3}）${NC}"
fi

if [ "$tool_calls3" -gt 0 ]; then
  echo -e "${GREEN}✅ 有工具调用（${tool_calls3} 次）${NC}"
else
  echo -e "${YELLOW}⚠️  无工具调用${NC}"
fi

if [ "$decision_log3" -gt 0 ]; then
  echo -e "${GREEN}✅ 决策日志已生成${NC}"
  echo ""
  echo "   决策日志内容:"
  echo "$response3" | jq -r '.explain.decision_log[]? | "     - \(.step): \(.decision)"' 2>/dev/null
else
  echo -e "${YELLOW}⚠️  决策日志为空${NC}"
fi
echo ""

# 6. 诊断总结
echo "=========================================="
echo "诊断总结"
echo "=========================================="
echo ""

issues=0

# 检查 Claude 编排是否触发
if [ "$reasons2" != "LLM_DECISION" ] && [ "$reasons3" != "LLM_DECISION" ]; then
  echo -e "${RED}❌ 问题: Claude 编排未触发${NC}"
  echo "   建议: 检查 ClaudeOrchestratorService 是否正确注入"
  issues=$((issues + 1))
fi

# 检查决策日志
if [ "$decision_log2" -eq 0 ] && [ "$decision_log3" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  问题: 决策日志为空${NC}"
  echo "   建议: 检查 Claude 编排执行过程，查看服务日志"
  issues=$((issues + 1))
fi

# 检查工具调用
if [ "$tool_calls3" -eq 0 ] && [ "$system_mode3" = "SYSTEM2" ]; then
  echo -e "${YELLOW}⚠️  问题: System 2 模式下无工具调用${NC}"
  echo "   建议: 检查 SkillsRegistry 注入和可用 Skills"
  issues=$((issues + 1))
fi

if [ $issues -eq 0 ]; then
  echo -e "${GREEN}✅ 未发现明显问题${NC}"
  echo "   建议: 查看服务日志获取更详细信息"
else
  echo ""
  echo -e "${YELLOW}发现 ${issues} 个潜在问题，请查看上述建议${NC}"
fi

echo ""
echo "=========================================="
echo "下一步调试建议"
echo "=========================================="
echo ""
echo "1. 查看服务日志:"
echo "   - 查找 '[ClaudeOrchestratorService] 已初始化'"
echo "   - 查找 '[Claude Orchestrator] 获取到 X 个可用 Skills'"
echo "   - 查找 '[Claude Orchestrator] 执行 Skill: ...'"
echo ""
echo "2. 检查 SkillsRegistry 注入:"
echo "   - 确认 SkillsModule 已导入到 AgentModule"
echo "   - 确认 SkillsRegistryService 已导出"
echo ""
echo "3. 验证 API Key:"
echo "   - 测试 API Key 是否可以调用 Claude API"
echo "   - 检查 API Key 格式是否正确"
echo ""
