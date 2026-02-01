#!/bin/bash
# scripts/test-destination-clarification-improvements.sh
# 测试目的地特化澄清系统的改进功能（Critical 字段、Gate 替代方案、会话 TTL）

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api}"
USER_TOKEN="${USER_TOKEN:-test-token}"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_section() {
    echo -e "\n${BLUE}============================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================${NC}"
}

log_test() {
    echo -e "\n${CYAN}🧪 $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "ℹ️  $1"
}

# 检查服务是否运行
check_service() {
    log_test "检查服务状态"
    if curl -s -f "${BASE_URL}/health" > /dev/null 2>&1 || curl -s -f "${BASE_URL}" > /dev/null 2>&1; then
        log_success "服务运行中"
        return 0
    else
        log_error "服务未运行，请先启动服务: npm run start:dev"
        return 1
    fi
}

# API 调用函数
api_call() {
    local method=$1
    local url=$2
    local data=$3
    
    local headers=(-H "Content-Type: application/json")
    if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "test-token" ]; then
        headers+=(-H "Authorization: Bearer $USER_TOKEN")
    fi
    
    if [ "$method" = "GET" ]; then
        curl -s -w "\nHTTP_CODE:%{http_code}" \
            -X GET \
            "${headers[@]}" \
            "${BASE_URL}${API_PREFIX}${url}" 2>/dev/null
    else
        echo "$data" | curl -s -w "\nHTTP_CODE:%{http_code}" \
            -X "$method" \
            "${headers[@]}" \
            -d @- \
            "${BASE_URL}${API_PREFIX}${url}" 2>/dev/null
    fi
}

# 测试 1: Critical 字段阻止创建逻辑
test_critical_fields_blocking() {
    log_section "测试 1: Critical 字段阻止创建逻辑"
    
    log_test "步骤 1.1: 创建新会话，提供基础信息"
    response=$(api_call POST "/trips/from-natural-language" '{"text": "我想去格陵兰，7月份，预算5万"}')
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" != "200" ]; then
        log_error "请求失败 (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    session_id=$(echo "$body" | jq -r '.data.sessionId // null' 2>/dev/null)
    if [ "$session_id" = "null" ] || [ -z "$session_id" ]; then
        log_error "未返回 sessionId"
        return 1
    fi
    
    log_success "Session ID: $session_id"
    
    needs_clarification=$(echo "$body" | jq -r '.data.needsClarification // false' 2>/dev/null)
    if [ "$needs_clarification" = "true" ]; then
        log_success "需要澄清（预期）"
        questions_count=$(echo "$body" | jq '.data.clarificationQuestions | length' 2>/dev/null || echo "0")
        log_info "返回 $questions_count 个澄清问题"
    fi
    
    log_test "步骤 1.2: 尝试创建行程（应该被 Critical 字段阻止）"
    response=$(api_call POST "/trips/from-natural-language" "{\"text\": \"我已经回答了所有问题，请创建行程\", \"sessionId\": \"$session_id\"}")
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" != "200" ]; then
        log_error "请求失败 (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    blocked=$(echo "$body" | jq -r '.data.blockedByCriticalFields // false' 2>/dev/null)
    if [ "$blocked" = "true" ]; then
        log_success "✅ Critical 字段阻止创建（符合预期）"
        warning_text=$(echo "$body" | jq -r '.data.plannerResponseBlocks[0].highlightText // "N/A"' 2>/dev/null)
        log_info "阻止原因: $warning_text"
        
        progress=$(echo "$body" | jq -r '.data.criticalFieldsProgress // null' 2>/dev/null)
        if [ "$progress" != "null" ]; then
            completed=$(echo "$body" | jq -r '.data.criticalFieldsProgress.completed // 0' 2>/dev/null)
            total=$(echo "$body" | jq -r '.data.criticalFieldsProgress.total // 0' 2>/dev/null)
            percent=$(echo "$body" | jq -r '.data.criticalFieldsProgress.percent // 0' 2>/dev/null)
            log_info "进度: $completed/$total ($percent%)"
        fi
    else
        trip_id=$(echo "$body" | jq -r '.data.trip.id // null' 2>/dev/null)
        if [ "$trip_id" != "null" ] && [ -n "$trip_id" ]; then
            log_warning "行程已创建（可能 Critical 字段检查未生效）"
        else
            log_info "继续澄清流程"
        fi
    fi
}

# 测试 2: Gate 替代方案选择
test_gate_alternative_selection() {
    log_section "测试 2: Gate 替代方案选择"
    
    log_test "步骤 2.1: 创建会话，触发 Gate 预检查"
    response=$(api_call POST "/trips/from-natural-language" '{"text": "我想去格陵兰，7月份，预算5万，我想进行东格陵兰远征，但我没有极地经验"}')
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" != "200" ]; then
        log_error "请求失败 (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    session_id=$(echo "$body" | jq -r '.data.sessionId // null' 2>/dev/null)
    if [ "$session_id" = "null" ] || [ -z "$session_id" ]; then
        log_error "未返回 sessionId"
        return 1
    fi
    
    log_success "Session ID: $session_id"
    
    blocked=$(echo "$body" | jq -r '.data.blockedByGate // false' 2>/dev/null)
    if [ "$blocked" = "true" ]; then
        log_success "✅ Gate 预检查触发（符合预期）"
        gate_check_id=$(echo "$body" | jq -r '.data.gateCheckId // "N/A"' 2>/dev/null)
        log_info "Gate Check ID: $gate_check_id"
        
        warning_text=$(echo "$body" | jq -r '.data.plannerResponseBlocks[0].highlightText // "N/A"' 2>/dev/null)
        log_info "警告消息: $warning_text"
        
        alternatives_count=$(echo "$body" | jq '.data.alternativeActions | length' 2>/dev/null || echo "0")
        if [ "$alternatives_count" -gt 0 ]; then
            log_success "返回 $alternatives_count 个替代方案"
            
            # 获取第一个替代方案
            alt_id=$(echo "$body" | jq -r '.data.alternativeActions[0].id // null' 2>/dev/null)
            alt_action=$(echo "$body" | jq -r '.data.alternativeActions[0].action // null' 2>/dev/null)
            
            if [ "$alt_id" != "null" ] && [ -n "$alt_id" ]; then
                log_test "步骤 2.2: 选择第一个替代方案"
                response=$(api_call POST "/trips/gate-alternative/select" "{
                    \"sessionId\": \"$session_id\",
                    \"gateCheckId\": \"$gate_check_id\",
                    \"alternativeId\": \"$alt_id\",
                    \"action\": \"$alt_action\",
                    \"userInput\": \"好的，我选择中等风险活动\"
                }")
                http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
                body=$(echo "$response" | sed '/HTTP_CODE/d')
                
                if [ "$http_code" = "200" ]; then
                    log_success "✅ 替代方案选择成功"
                    needs_clarification=$(echo "$body" | jq -r '.data.needsClarification // false' 2>/dev/null)
                    if [ "$needs_clarification" = "true" ]; then
                        log_info "继续澄清流程"
                    else
                        trip_id=$(echo "$body" | jq -r '.data.trip.id // null' 2>/dev/null)
                        if [ "$trip_id" != "null" ] && [ -n "$trip_id" ]; then
                            log_success "行程创建成功"
                        fi
                    fi
                else
                    log_error "选择替代方案失败 (HTTP $http_code)"
                    echo "$body" | jq '.' 2>/dev/null || echo "$body"
                fi
            fi
        else
            log_warning "未返回替代方案"
        fi
    else
        log_warning "Gate 预检查未触发（可能需要更多参数）"
    fi
}

# 测试 3: 会话 TTL 刷新
test_session_ttl_refresh() {
    log_section "测试 3: 会话 TTL 刷新"
    
    log_test "步骤 3.1: 创建新会话"
    response=$(api_call POST "/trips/from-natural-language" '{"text": "我想去格陵兰，7月份，预算5万"}')
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" != "200" ]; then
        log_error "请求失败 (HTTP $http_code)"
        return 1
    fi
    
    session_id=$(echo "$body" | jq -r '.data.sessionId // null' 2>/dev/null)
    if [ "$session_id" = "null" ] || [ -z "$session_id" ]; then
        log_error "未返回 sessionId"
        return 1
    fi
    
    log_success "Session ID: $session_id"
    
    log_test "步骤 3.2: 获取会话上下文（检查 expiresAt）"
    response=$(api_call GET "/trips/nl-conversation/$session_id")
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" != "200" ]; then
        log_error "获取会话上下文失败 (HTTP $http_code)"
        return 1
    fi
    
    expires_at1=$(echo "$body" | jq -r '.data.expiresAt // null' 2>/dev/null)
    if [ "$expires_at1" != "null" ] && [ -n "$expires_at1" ]; then
        log_success "初始过期时间: $expires_at1"
    fi
    
    log_test "步骤 3.3: 发送新消息（应该刷新 TTL）"
    sleep 1
    
    response=$(api_call POST "/trips/from-natural-language" "{\"text\": \"我的极地经验：有1-2次北极/高山经验\", \"sessionId\": \"$session_id\"}")
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    
    if [ "$http_code" != "200" ]; then
        log_error "请求失败 (HTTP $http_code)"
        return 1
    fi
    
    log_test "步骤 3.4: 再次获取会话上下文（检查 expiresAt 是否更新）"
    response=$(api_call GET "/trips/nl-conversation/$session_id")
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" != "200" ]; then
        log_error "获取会话上下文失败 (HTTP $http_code)"
        return 1
    fi
    
    expires_at2=$(echo "$body" | jq -r '.data.expiresAt // null' 2>/dev/null)
    if [ "$expires_at2" != "null" ] && [ -n "$expires_at2" ]; then
        log_success "更新后过期时间: $expires_at2"
        
        if [ "$expires_at1" != "null" ] && [ "$expires_at2" != "null" ]; then
            # 比较时间（简单字符串比较，ISO 8601 格式可以直接比较）
            if [ "$expires_at2" \> "$expires_at1" ]; then
                log_success "✅ TTL 已刷新（过期时间已更新）"
            else
                log_warning "⚠️  TTL 未刷新（过期时间未更新）"
            fi
        fi
    fi
}

# 主函数
main() {
    echo -e "\n${BLUE}============================================================${NC}"
    echo -e "${BLUE}目的地特化澄清系统改进功能测试${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "\nBase URL: ${BASE_URL}${API_PREFIX}"
    echo -e "User Token: ${USER_TOKEN:+已设置}${USER_TOKEN:-未设置}\n"
    
    if ! check_service; then
        exit 1
    fi
    
    # 运行测试
    test_critical_fields_blocking
    test_gate_alternative_selection
    test_session_ttl_refresh
    
    log_section "测试完成"
    log_success "所有测试已完成"
    echo -e "\n提示:"
    echo "1. 设置 USER_TOKEN 环境变量以使用真实认证"
    echo "2. 设置 BASE_URL 环境变量以指定服务地址（默认: http://localhost:3000）"
    echo "3. 设置 API_PREFIX 环境变量以指定 API 前缀（默认: /api）"
    echo ""
}

main
