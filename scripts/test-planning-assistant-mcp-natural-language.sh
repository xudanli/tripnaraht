#!/bin/bash

# Planning Assistant V2 - MCP 服务自然语言调用测试脚本
# 
# 测试所有 MCP 服务的自然语言调用功能

set -e

# 配置
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${BASE_URL}/api/agent/planning-assistant/v2"
SESSION_ID=""
USER_ID="test_user_$(date +%s)"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 打印测试标题
print_test() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}测试: $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 打印成功
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_TESTS++))
}

# 打印失败
print_failure() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED_TESTS++))
}

# 打印信息
print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# 发送请求并检查响应
test_endpoint() {
    local test_name="$1"
    local message="$2"
    local expected_target="$3"
    local expected_field="$4"
    
    ((TOTAL_TESTS++))
    
    print_test "$test_name"
    print_info "输入: $message"
    print_info "期望路由: $expected_target"
    print_info "期望字段: $expected_field"
    
    # 发送请求
    response=$(curl -s -X POST "${API_BASE}/chat" \
        -H "Content-Type: application/json" \
        -d "{
            \"sessionId\": \"${SESSION_ID}\",
            \"userId\": \"${USER_ID}\",
            \"message\": \"${message}\",
            \"language\": \"zh\"
        }" 2>&1)
    
    # 检查响应
    if [ $? -ne 0 ]; then
        print_failure "请求失败"
        echo "$response"
        return 1
    fi
    
    # 检查响应是否包含 JSON
    if ! echo "$response" | jq . > /dev/null 2>&1; then
        print_failure "响应不是有效的 JSON"
        echo "$response"
        return 1
    fi
    
    # 检查路由目标
    actual_target=$(echo "$response" | jq -r '.routing.target // "chat"')
    if [ "$actual_target" != "$expected_target" ]; then
        print_failure "路由目标不匹配: 期望 '$expected_target', 实际 '$actual_target'"
        echo "$response" | jq .
        return 1
    fi
    
    # 检查响应字段
    if [ -n "$expected_field" ]; then
        field_exists=$(echo "$response" | jq -r ".${expected_field} // null")
        if [ "$field_exists" = "null" ]; then
            print_failure "响应中缺少字段: $expected_field"
            echo "$response" | jq .
            return 1
        fi
    fi
    
    # 检查消息字段
    message_cn=$(echo "$response" | jq -r '.messageCN // ""')
    if [ -z "$message_cn" ]; then
        print_failure "响应中缺少 messageCN 字段"
        echo "$response" | jq .
        return 1
    fi
    
    print_success "测试通过"
    print_info "路由目标: $actual_target"
    print_info "响应消息: $message_cn"
    
    # 显示响应摘要
    if [ -n "$expected_field" ]; then
        field_count=$(echo "$response" | jq -r ".${expected_field} | length // 0")
        print_info "返回数据数量: $field_count"
    fi
    
    return 0
}

# 创建会话
create_session() {
    print_test "创建会话"
    
    response=$(curl -s -X POST "${API_BASE}/sessions" \
        -H "Content-Type: application/json" \
        -d "{
            \"userId\": \"${USER_ID}\"
        }" 2>&1)
    
    if [ $? -ne 0 ]; then
        print_failure "创建会话失败"
        echo "$response"
        exit 1
    fi
    
    SESSION_ID=$(echo "$response" | jq -r '.sessionId // ""')
    
    if [ -z "$SESSION_ID" ]; then
        print_failure "会话ID为空"
        echo "$response"
        exit 1
    fi
    
    print_success "会话创建成功: $SESSION_ID"
}

# 主测试流程
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║  Planning Assistant V2 - MCP 服务自然语言调用测试                            ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    print_info "API 基础 URL: $API_BASE"
    print_info "用户 ID: $USER_ID"
    
    # 创建会话
    create_session
    
    # 测试所有 MCP 服务
    echo -e "\n${YELLOW}开始测试 MCP 服务自然语言调用...${NC}\n"
    
    # 1. 酒店搜索
    test_endpoint \
        "酒店搜索 (Hotel Direct API)" \
        "推荐冰岛的酒店" \
        "hotel" \
        "hotels"
    
    # 2. Airbnb 搜索
    test_endpoint \
        "Airbnb 搜索 (Airbnb MCP)" \
        "推荐 Airbnb 房源" \
        "airbnb" \
        "airbnbListings"
    
    # 3. 住宿搜索（酒店+Airbnb）
    test_endpoint \
        "住宿搜索 (Hotel + Airbnb)" \
        "推荐住宿" \
        "accommodation" \
        "hotels"
    
    # 4. 餐厅搜索
    test_endpoint \
        "餐厅搜索 (Restaurant Direct API)" \
        "推荐餐厅" \
        "restaurant" \
        "restaurants"
    
    # 5. 天气查询
    test_endpoint \
        "天气查询 (Weather Direct API)" \
        "冰岛天气怎么样" \
        "weather" \
        "weather"
    
    # 6. Web 搜索
    test_endpoint \
        "Web 搜索 (Exa MCP)" \
        "搜索冰岛旅游攻略" \
        "search" \
        "searchResults"
    
    # 7. 航班搜索
    test_endpoint \
        "航班搜索 (Amadeus MCP)" \
        "搜索从北京到上海的航班" \
        "flight" \
        "flights"
    
    # 8. 铁路查询
    test_endpoint \
        "铁路查询 (Rail MCP)" \
        "查询从巴黎到伦敦的火车" \
        "rail" \
        "railRoutes"
    
    # 9. 翻译服务
    test_endpoint \
        "翻译服务 (Translation Direct API)" \
        "翻译一下 Hello World" \
        "translate" \
        "translation"
    
    # 10. 货币转换
    test_endpoint \
        "货币转换 (Currency Direct API)" \
        "100美元换人民币" \
        "currency" \
        "currencyConversion"
    
    # 11. 图片搜索
    test_endpoint \
        "图片搜索 (Image Direct API)" \
        "找一些冰岛的图片" \
        "image" \
        "images"
    
    # 打印测试结果
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}测试结果汇总${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "总测试数: ${TOTAL_TESTS}"
    echo -e "${GREEN}通过: ${PASSED_TESTS}${NC}"
    echo -e "${RED}失败: ${FAILED_TESTS}${NC}"
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "\n${GREEN}🎉 所有测试通过！${NC}"
        exit 0
    else
        echo -e "\n${RED}⚠️  有 ${FAILED_TESTS} 个测试失败${NC}"
        exit 1
    fi
}

# 运行测试
main
