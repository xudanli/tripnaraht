#!/bin/bash
# 规划助手智能体接口测试脚本（Shell版本）

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
TEST_USER_ID="${TEST_USER_ID:-test-user-$(date +%s)}"

echo "🚀 开始测试规划助手智能体接口..."
echo "📍 API地址: $API_BASE_URL"
echo "👤 测试用户ID: $TEST_USER_ID"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
PASSED=0
FAILED=0
SESSION_ID=""

# 测试函数
test_api() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5
  
  expected_status=${expected_status:-200}
  
  echo "📋 测试: $name"
  
  if [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      "${API_BASE_URL}${endpoint}")
  else
    response=$(curl -s -w "\n%{http_code}" -X GET \
      "${API_BASE_URL}${endpoint}")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "$expected_status" ]; then
    echo -e "${GREEN}✅ 成功${NC} (HTTP $http_code)"
    PASSED=$((PASSED + 1))
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    return 0
  else
    echo -e "${RED}❌ 失败: HTTP $http_code (期望 $expected_status)${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# 测试1: 创建匿名会话
echo "测试1: 创建匿名会话"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "${API_BASE_URL}/api/agent/planning-assistant/sessions")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo -e "${GREEN}✅ 成功${NC}"
  SESSION_ID=$(echo "$BODY" | jq -r '.sessionId' 2>/dev/null)
  echo "  会话ID: $SESSION_ID"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试2: 创建用户会话
echo "测试2: 创建用户会话"
USER_SESSION_DATA=$(jq -n --arg userId "$TEST_USER_ID" '{userId: $userId}')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$USER_SESSION_DATA" \
  "${API_BASE_URL}/api/agent/planning-assistant/sessions")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo -e "${GREEN}✅ 成功${NC}"
  USER_SESSION_ID=$(echo "$BODY" | jq -r '.sessionId' 2>/dev/null)
  echo "  会话ID: $USER_SESSION_ID"
  if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$USER_SESSION_ID
  fi
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试3: 发送消息进行对话
if [ -n "$SESSION_ID" ]; then
  echo "测试3: 发送消息进行对话"
  CHAT_DATA=$(jq -n \
    --arg sessionId "$SESSION_ID" \
    --arg userId "$TEST_USER_ID" \
    --arg message "我想去冰岛旅行，有什么推荐吗？" \
    --arg language "zh" \
    '{sessionId: $sessionId, userId: $userId, message: $message, language: $language}')
  
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$CHAT_DATA" \
    "${API_BASE_URL}/api/agent/planning-assistant/chat")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    PHASE=$(echo "$BODY" | jq -r '.phase' 2>/dev/null)
    MESSAGE=$(echo "$BODY" | jq -r '.messageCN // .message' 2>/dev/null)
    REC_COUNT=$(echo "$BODY" | jq -r '.recommendations | length' 2>/dev/null)
    PLAN_COUNT=$(echo "$BODY" | jq -r '.planCandidates | length' 2>/dev/null)
    echo "  阶段: $PHASE"
    echo "  回复: ${MESSAGE:0:100}..."
    if [ "$REC_COUNT" != "null" ] && [ "$REC_COUNT" != "0" ]; then
      echo "  推荐数量: $REC_COUNT"
    fi
    if [ "$PLAN_COUNT" != "null" ] && [ "$PLAN_COUNT" != "0" ]; then
      echo "  方案数量: $PLAN_COUNT"
    fi
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    FAILED=$((FAILED + 1))
  fi
  echo ""
else
  echo -e "${YELLOW}⚠️  跳过测试3（没有可用的会话ID）${NC}"
  echo ""
fi

# 测试4: 获取会话状态
if [ -n "$SESSION_ID" ]; then
  echo "测试4: 获取会话状态"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "${API_BASE_URL}/api/agent/planning-assistant/sessions/${SESSION_ID}")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    PHASE=$(echo "$BODY" | jq -r '.phase' 2>/dev/null)
    MSG_COUNT=$(echo "$BODY" | jq -r '.messageCount // 0' 2>/dev/null)
    REC_COUNT=$(echo "$BODY" | jq -r '.recommendations | length // 0' 2>/dev/null)
    echo "  会话ID: $SESSION_ID"
    echo "  阶段: $PHASE"
    echo "  消息数: $MSG_COUNT"
    if [ "$REC_COUNT" != "null" ] && [ "$REC_COUNT" != "0" ]; then
      echo "  推荐数量: $REC_COUNT"
    fi
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    FAILED=$((FAILED + 1))
  fi
  echo ""
else
  echo -e "${YELLOW}⚠️  跳过测试4（没有可用的会话ID）${NC}"
  echo ""
fi

# 测试5: 快速推荐
echo "测试5: 快速推荐（无需会话）"
QUICK_RECOMMEND_URL="${API_BASE_URL}/api/agent/planning-assistant/quick-recommend?budget=20000&travelersCount=2&duration_days=7&travel_style=adventure&language=zh"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$QUICK_RECOMMEND_URL")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 成功${NC}"
  QUICK_SESSION_ID=$(echo "$BODY" | jq -r '.sessionId' 2>/dev/null)
  REC_COUNT=$(echo "$BODY" | jq -r '.recommendations | length' 2>/dev/null)
  echo "  会话ID: $QUICK_SESSION_ID"
  if [ "$REC_COUNT" != "null" ] && [ "$REC_COUNT" != "0" ]; then
    echo "  推荐数量: $REC_COUNT"
    echo "$BODY" | jq -r '.recommendations[0:3][] | "    - \(.nameCN // .name) (\(.countryCode))"' 2>/dev/null
  fi
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试6: 获取用户偏好摘要
echo "测试6: 获取用户偏好摘要"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "${API_BASE_URL}/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 成功${NC}"
  PREF_COUNT=$(echo "$BODY" | jq -r '.topPreferences | length // 0' 2>/dev/null)
  if [ "$PREF_COUNT" != "null" ] && [ "$PREF_COUNT" != "0" ]; then
    echo "  偏好数量: $PREF_COUNT"
    echo "$BODY" | jq -r '.topPreferences[0:5][] | "    - \(.category): \(.value) (置信度: \(.confidence))"' 2>/dev/null
  else
    echo "  暂无偏好数据（这是正常的，如果用户还没有使用过规划助手）"
  fi
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试7: 清除用户偏好
echo "测试7: 清除用户偏好"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "${API_BASE_URL}/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences/clear")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  SUCCESS=$(echo "$BODY" | jq -r '.success' 2>/dev/null)
  if [ "$SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ 失败: success=false${NC}"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    FAILED=$((FAILED + 1))
  fi
else
  echo -e "${RED}❌ 失败: HTTP $HTTP_CODE${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# 汇总结果
echo "============================================================"
echo "📊 测试结果汇总"
echo "============================================================"
echo "总计: $((PASSED + FAILED)) 个测试"
echo -e "${GREEN}通过: $PASSED 个 ✅${NC}"
echo -e "${RED}失败: $FAILED 个 ❌${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
  exit 1
fi
