#!/bin/bash
#
# 用户偏好接口测试脚本（Shell版本）
#
# 使用方法：
#   ./scripts/test-user-preferences-api.sh [baseUrl] [userId] [token]
#
# 环境变量：
#   API_BASE_URL - API基础URL（默认: http://localhost:3000）
#   TEST_USER_ID - 测试用户ID（可选）
#   TEST_TOKEN - 认证Token（可选）
#

set -e

API_BASE_URL="${API_BASE_URL:-${1:-http://localhost:3000}}"
TEST_USER_ID="${TEST_USER_ID:-${2:-test-user-$(date +%s)}}"
TEST_TOKEN="${TEST_TOKEN:-${3:-}}"

echo "🚀 开始测试用户偏好接口..."
echo "API Base URL: $API_BASE_URL"
echo "Test User ID: $TEST_USER_ID"
echo "Token: ${TEST_TOKEN:+已设置}"
echo "============================================================"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
SUCCESS=0
FAIL=0

# 执行HTTP请求
http_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local require_auth=$4
    
    local url="${API_BASE_URL}${endpoint}"
    local headers=(-H "Content-Type: application/json")
    
    if [ -n "$TEST_TOKEN" ]; then
        headers+=(-H "Authorization: Bearer $TEST_TOKEN")
    elif [ "$require_auth" = "true" ]; then
        echo -e "${YELLOW}⚠️  警告: 此接口需要认证，但未提供TOKEN${NC}"
    fi
    
    if [ -n "$data" ]; then
        curl -s -w "\n%{http_code}" -X "$method" "$url" \
            "${headers[@]}" \
            -d "$data"
    else
        curl -s -w "\n%{http_code}" -X "$method" "$url" \
            "${headers[@]}"
    fi
}

# 运行测试
run_test() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local require_auth=${5:-false}
    
    echo ""
    echo "📋 测试: $name"
    echo "   方法: $method $endpoint"
    
    if [ -n "$data" ]; then
        echo "   请求体: $data"
    fi
    
    local response=$(http_request "$method" "$endpoint" "$data" "$require_auth")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 400 ]; then
        echo -e "   ${RED}❌ 失败: HTTP $http_code${NC}"
        echo "   响应: $body" | jq '.' 2>/dev/null || echo "   响应: $body"
        FAIL=$((FAIL + 1))
        return 1
    else
        echo -e "   ${GREEN}✅ 成功: HTTP $http_code${NC}"
        echo "   响应: $body" | jq '.' 2>/dev/null || echo "   响应: $body"
        SUCCESS=$((SUCCESS + 1))
        return 0
    fi
}

# ============================================
# 测试1: 获取用户偏好画像（需要认证）
# ============================================
run_test \
    "获取用户偏好画像" \
    "GET" \
    "/api/users/profile" \
    "" \
    "true"

# ============================================
# 测试2: 更新用户偏好画像（需要认证）
# ============================================
UPDATE_DATA='{
  "preferences": {
    "preferredAttractionTypes": ["ATTRACTION", "NATURE", "CULTURE"],
    "dietaryRestrictions": ["VEGETARIAN"],
    "preferOffbeatAttractions": true,
    "travelPreferences": {
      "pace": "MODERATE",
      "budget": "MEDIUM",
      "accommodation": "COMFORTABLE"
    },
    "nationality": "CN",
    "residencyCountry": "CN",
    "tags": ["solo", "adventure"],
    "other": {
      "accessibility": true,
      "petFriendly": false
    }
  }
}'

run_test \
    "更新用户偏好画像" \
    "PUT" \
    "/api/users/profile" \
    "$UPDATE_DATA" \
    "true"

# ============================================
# 测试3: 再次获取用户偏好画像（验证更新）
# ============================================
run_test \
    "验证更新后的用户偏好画像" \
    "GET" \
    "/api/users/profile" \
    "" \
    "true"

# ============================================
# 测试4: 获取用户偏好摘要（规划助手）
# ============================================
run_test \
    "获取用户偏好摘要（规划助手）" \
    "GET" \
    "/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences" \
    "" \
    "false"

# ============================================
# 测试5: 部分更新用户偏好
# ============================================
PARTIAL_UPDATE_DATA='{
  "preferences": {
    "travelPreferences": {
      "pace": "FAST",
      "budget": "HIGH"
    },
    "tags": ["couple", "luxury"]
  }
}'

run_test \
    "部分更新用户偏好（只更新部分字段）" \
    "PUT" \
    "/api/users/profile" \
    "$PARTIAL_UPDATE_DATA" \
    "true"

# ============================================
# 测试6: 推断用户偏好（决策风格）
# ============================================
run_test \
    "推断用户偏好（决策风格）" \
    "GET" \
    "/api/v1/decision-replay/style/${TEST_USER_ID}/preferences" \
    "" \
    "true"

# ============================================
# 测试7: 清除用户偏好（规划助手）
# ============================================
run_test \
    "清除用户偏好（规划助手）" \
    "POST" \
    "/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences/clear" \
    "" \
    "false"

# ============================================
# 测试8: 验证清除后的偏好摘要
# ============================================
run_test \
    "验证清除后的用户偏好摘要" \
    "GET" \
    "/api/agent/planning-assistant/users/${TEST_USER_ID}/preferences" \
    "" \
    "false"

# ============================================
# 输出测试总结
# ============================================
echo ""
echo "============================================================"
echo "📊 测试总结"
echo "============================================================"
echo ""
TOTAL=$((SUCCESS + FAIL))
echo "总计: $TOTAL 个测试"
echo -e "${GREEN}✅ 成功: $SUCCESS${NC}"
echo -e "${RED}❌ 失败: $FAIL${NC}"

if [ $FAIL -gt 0 ]; then
    exit 1
else
    exit 0
fi
