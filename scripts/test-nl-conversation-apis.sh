#!/bin/bash
# 测试自然语言对话历史记录接口

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api}"

echo "============================================================"
echo "自然语言对话历史记录接口测试"
echo "============================================================"
echo ""
echo "Base URL: ${BASE_URL}${API_PREFIX}"
echo ""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

log_test() {
    echo -e "\n${BLUE}🧪 $1${NC}"
}

# 检查服务是否运行
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1 && ! curl -s "${BASE_URL}" > /dev/null 2>&1; then
    log_error "服务未运行，请先启动服务: npm run start:dev"
    exit 1
fi

log_success "服务运行中"
echo ""

# ==================== 测试 1: 创建会话并发送消息 ====================
log_test "测试 1: 创建会话并发送消息"

RESPONSE=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d '{"text": "我想去格陵兰，7月份，预算5万"}')

SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
    log_error "未获取到 sessionId"
    echo "$RESPONSE" | head -20
    exit 1
fi

log_success "会话已创建: $SESSION_ID"
log_info "响应: $(echo "$RESPONSE" | grep -o '"needsClarification":[^,]*' | head -1)"

# ==================== 测试 2: 获取单个会话 ====================
log_test "测试 2: 获取单个会话"

SESSION_DATA=$(curl -s "${BASE_URL}${API_PREFIX}/trips/nl-conversation/${SESSION_ID}")

if echo "$SESSION_DATA" | grep -q '"success":true'; then
    log_success "会话获取成功"
    MESSAGE_COUNT=$(echo "$SESSION_DATA" | grep -o '"messages":\[.*\]' | grep -o '{"id"' | wc -l)
    log_info "消息数量: $MESSAGE_COUNT"
    log_info "会话ID: $(echo "$SESSION_DATA" | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)"
else
    log_error "获取会话失败"
    echo "$SESSION_DATA" | head -10
fi

# ==================== 测试 3: 发送第二条消息 ====================
log_test "测试 3: 发送第二条消息（更新会话）"

SECOND_RESPONSE=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"我的极地经验是中级\", \"sessionId\": \"$SESSION_ID\"}")

if echo "$SECOND_RESPONSE" | grep -q '"success":true'; then
    log_success "第二条消息已发送"
    
    # 验证会话是否更新
    UPDATED_SESSION=$(curl -s "${BASE_URL}${API_PREFIX}/trips/nl-conversation/${SESSION_ID}")
    UPDATED_COUNT=$(echo "$UPDATED_SESSION" | grep -o '{"id"' | wc -l)
    log_info "更新后消息数量: $UPDATED_COUNT"
else
    log_error "发送第二条消息失败"
fi

# ==================== 测试 4: 更新消息的问题答案 ====================
log_test "测试 4: 更新消息的问题答案"

# 获取最后一条AI消息的ID
AI_MESSAGES=$(echo "$SESSION_DATA" | grep -o '"role":"assistant"[^}]*"id":"[^"]*' | tail -1)
MESSAGE_ID=$(echo "$AI_MESSAGES" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -n "$MESSAGE_ID" ]; then
    UPDATE_RESPONSE=$(curl -s -X PUT "${BASE_URL}${API_PREFIX}/trips/nl-conversation/${SESSION_ID}/messages/${MESSAGE_ID}" \
      -H "Content-Type: application/json" \
      -d '{"questionAnswers": {"gl_experience_level": "enthusiast", "gl_risk_tolerance": "medium"}}')
    
    if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
        log_success "问题答案已更新"
    else
        log_error "更新问题答案失败"
    fi
else
    log_info "未找到AI消息，跳过更新问题答案测试"
fi

# ==================== 测试 5: 更新会话上下文 ====================
log_test "测试 5: 更新会话上下文"

UPDATE_CONTEXT_RESPONSE=$(curl -s -X PUT "${BASE_URL}${API_PREFIX}/trips/nl-conversation/${SESSION_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"partialParams\": {\"destination\": \"GL\", \"startDate\": \"2026-07-01\"}}")

if echo "$UPDATE_CONTEXT_RESPONSE" | grep -q '"success":true'; then
    log_success "会话上下文已更新"
else
    log_error "更新会话上下文失败"
fi

# ==================== 测试 6: 获取所有会话 ====================
log_test "测试 6: 获取所有会话"

ALL_SESSIONS=$(curl -s "${BASE_URL}${API_PREFIX}/trips/nl-conversation")

if echo "$ALL_SESSIONS" | grep -q '"success":true'; then
    SESSION_COUNT=$(echo "$ALL_SESSIONS" | grep -o '"sessionId"' | wc -l)
    log_success "获取到 $SESSION_COUNT 个会话"
else
    log_error "获取所有会话失败"
fi

# ==================== 测试 7: 删除会话 ====================
log_test "测试 7: 删除会话"

DELETE_RESPONSE=$(curl -s -X DELETE "${BASE_URL}${API_PREFIX}/trips/nl-conversation/${SESSION_ID}")

if echo "$DELETE_RESPONSE" | grep -q '"success":true'; then
    log_success "会话已删除"
    
    # 验证删除
    VERIFY_DELETE=$(curl -s "${BASE_URL}${API_PREFIX}/trips/nl-conversation/${SESSION_ID}")
    if echo "$VERIFY_DELETE" | grep -q '"NOT_FOUND"'; then
        log_success "验证成功：会话已正确删除"
    fi
else
    log_error "删除会话失败"
fi

echo ""
echo "============================================================"
log_success "所有测试已完成"
echo "============================================================"
