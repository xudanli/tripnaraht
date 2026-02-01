#!/bin/bash

# 目的地特化澄清系统 - API 测试脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api}"  # API前缀
USER_TOKEN="${USER_TOKEN:-}"  # 用户token，需要设置
ADMIN_TOKEN="${ADMIN_TOKEN:-}"  # 管理员token，需要设置

echo "=========================================="
echo "目的地特化澄清系统 - API 测试"
echo "=========================================="
echo ""
echo "Base URL: $BASE_URL"
echo ""

# 检查服务是否运行
echo -e "${BLUE}检查服务状态...${NC}"
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1 && ! curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo -e "${RED}❌ 服务未运行，请先启动服务: npm run start:dev${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 服务运行中${NC}"
echo ""

# ==================== 管理侧接口测试 ====================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}管理侧接口测试${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 获取所有配置列表
echo -e "${YELLOW}1. 获取所有配置列表${NC}"
echo "GET $BASE_URL$API_PREFIX/admin/destination-clarification"
if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}⚠️  ADMIN_TOKEN 未设置，跳过需要认证的接口${NC}"
else
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$BASE_URL$API_PREFIX/admin/destination-clarification")
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ 成功${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
        echo "$body"
    fi
fi
echo ""

# 2. 获取格陵兰配置
echo -e "${YELLOW}2. 获取格陵兰配置${NC}"
echo "GET $BASE_URL$API_PREFIX/admin/destination-clarification/GL"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    "$BASE_URL$API_PREFIX/admin/destination-clarification/GL")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    
    # 检查配置是否存在
    enabled=$(echo "$body" | jq -r '.data.enabled // false' 2>/dev/null || echo "false")
    if [ "$enabled" = "true" ]; then
        echo -e "${GREEN}✅ 格陵兰配置已启用${NC}"
    else
        echo -e "${YELLOW}⚠️  格陵兰配置未启用${NC}"
    fi
else
    echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# 3. 测试配置
echo -e "${YELLOW}3. 测试格陵兰配置${NC}"
echo "POST $BASE_URL$API_PREFIX/admin/destination-clarification/GL/test"
test_payload='{
  "currentParams": {
    "destination": "GL",
    "startDate": "2025-07-01",
    "endDate": "2025-07-10",
    "totalBudget": 50000
  },
  "userInput": "我想去东格陵兰远征"
}'

response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$test_payload" \
    "$BASE_URL$API_PREFIX/admin/destination-clarification/GL/test")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✅ 成功${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    
    # 检查测试结果
    current_round=$(echo "$body" | jq -r '.data.currentRound.name // null' 2>/dev/null)
    if [ "$current_round" != "null" ] && [ -n "$current_round" ]; then
        echo -e "${GREEN}✅ 当前轮次: $current_round${NC}"
    fi
    
    questions_count=$(echo "$body" | jq '.data.questions | length' 2>/dev/null || echo "0")
    if [ "$questions_count" -gt 0 ]; then
        echo -e "${GREEN}✅ 返回 $questions_count 个澄清问题${NC}"
    fi
else
    echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# ==================== 用户侧接口测试 ====================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}用户侧接口测试${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ -z "$USER_TOKEN" ]; then
    echo -e "${RED}⚠️  USER_TOKEN 未设置，跳过需要认证的接口${NC}"
    echo -e "${YELLOW}提示: 设置 USER_TOKEN 环境变量以测试用户侧接口${NC}"
    echo ""
else
    # 4. 自然语言创建行程 - 第一轮（基础信息）
    echo -e "${YELLOW}4. 自然语言创建行程 - 第一轮（基础信息）${NC}"
    echo "POST $BASE_URL$API_PREFIX/trips/from-natural-language"
    nl_payload='{
      "text": "我想去格陵兰，7月份，预算5万"
    }'
    
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" \
        -d "$nl_payload" \
        "$BASE_URL$API_PREFIX/trips/from-natural-language")
    http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE/d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ 成功${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        
        # 提取sessionId
        session_id=$(echo "$body" | jq -r '.data.sessionId // null' 2>/dev/null)
        if [ "$session_id" != "null" ] && [ -n "$session_id" ]; then
            echo -e "${GREEN}✅ Session ID: $session_id${NC}"
            export SESSION_ID="$session_id"
        fi
        
        # 检查是否需要澄清
        needs_clarification=$(echo "$body" | jq -r '.data.needsClarification // false' 2>/dev/null)
        if [ "$needs_clarification" = "true" ]; then
            echo -e "${GREEN}✅ 需要澄清${NC}"
            questions_count=$(echo "$body" | jq '.data.clarificationQuestions | length' 2>/dev/null || echo "0")
            echo -e "${GREEN}✅ 返回 $questions_count 个澄清问题${NC}"
        else
            trip_id=$(echo "$body" | jq -r '.data.trip.id // null' 2>/dev/null)
            if [ "$trip_id" != "null" ] && [ -n "$trip_id" ]; then
                echo -e "${GREEN}✅ 行程创建成功: $trip_id${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
        echo "$body"
    fi
    echo ""
    
    # 5. 继续对话（如果有sessionId）
    if [ -n "$SESSION_ID" ]; then
        echo -e "${YELLOW}5. 继续对话 - 回答澄清问题${NC}"
        echo "POST $BASE_URL$API_PREFIX/trips/from-natural-language"
        answer_payload="{
          \"text\": \"我的极地经验是：有1-2次北极/高山经验，风险承受度：接受高风险，活动类型：冰川徒步\",
          \"sessionId\": \"$SESSION_ID\"
        }"
        
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $USER_TOKEN" \
            -d "$answer_payload" \
            "$BASE_URL$API_PREFIX/trips/from-natural-language")
        http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
        body=$(echo "$response" | sed '/HTTP_CODE/d')
        
        if [ "$http_code" = "200" ]; then
            echo -e "${GREEN}✅ 成功${NC}"
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        else
            echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
            echo "$body"
        fi
        echo ""
    fi
    
    # 6. 获取对话上下文（如果有sessionId）
    if [ -n "$SESSION_ID" ]; then
        echo -e "${YELLOW}6. 获取对话上下文${NC}"
        echo "GET $BASE_URL$API_PREFIX/trips/nl-conversation/$SESSION_ID"
        
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
            -H "Authorization: Bearer $USER_TOKEN" \
            "$BASE_URL$API_PREFIX/trips/nl-conversation/$SESSION_ID")
        http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
        body=$(echo "$response" | sed '/HTTP_CODE/d')
        
        if [ "$http_code" = "200" ]; then
            echo -e "${GREEN}✅ 成功${NC}"
            messages_count=$(echo "$body" | jq '.data.messages | length' 2>/dev/null || echo "0")
            echo -e "${GREEN}✅ 对话历史包含 $messages_count 条消息${NC}"
            echo "$body" | jq '.data.messages[] | {role, content: (.content | .[0:50])}' 2>/dev/null || echo "$body"
        else
            echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
            echo "$body"
        fi
        echo ""
    fi
fi

echo "=========================================="
echo -e "${GREEN}✅ 测试完成${NC}"
echo "=========================================="
echo ""
echo "提示:"
echo "1. 设置 USER_TOKEN 环境变量以测试用户侧接口"
echo "2. 设置 ADMIN_TOKEN 环境变量以测试管理侧接口"
echo "3. 设置 BASE_URL 环境变量以指定服务地址（默认: http://localhost:3000）"
echo ""
