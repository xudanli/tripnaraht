#!/bin/bash
# KPU和知识库CRUD接口快速测试脚本

BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"

echo "🧪 KPU和知识库CRUD接口快速测试"
echo "================================"
echo "API地址: $BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -e "${BLUE}测试: ${name}${NC}"
    echo "  ${method} ${endpoint}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "${method}" \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${BASE_URL}${endpoint}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}  ✅ 成功 (HTTP ${http_code})${NC}"
        echo "$body" | jq -c '.' 2>/dev/null | head -c 200
        echo ""
    else
        echo -e "${RED}  ❌ 失败 (HTTP ${http_code})${NC}"
        echo "$body" | head -c 200
        echo ""
    fi
    echo ""
}

# 检查服务器
echo "🔍 检查服务器状态..."
if curl -s "${BASE_URL}/kpu/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 服务器运行正常${NC}"
    echo ""
else
    echo -e "${RED}❌ 无法连接到服务器${NC}"
    echo "请确保服务器正在运行: npm run start:dev"
    exit 1
fi

# KPU接口测试
echo "================================"
echo "📊 KPU接口测试"
echo "================================"

test_endpoint "健康检查" "GET" "/kpu/health"
test_endpoint "获取指标" "GET" "/kpu/metrics"
test_endpoint "获取缓存统计" "GET" "/kpu/cache/stats"

test_endpoint "验证知识片段" "POST" "/kpu/validate-snippet" '{
  "content": "F26公路是冰岛的一条重要公路",
  "source": "test"
}'

test_endpoint "检索并验证" "POST" "/kpu/retrieve-and-validate" '{
  "query": "冰岛F26公路",
  "limit": 3,
  "enableSnippetValidation": true
}'

# 知识库CRUD测试
echo "================================"
echo "📚 知识库文档CRUD测试"
echo "================================"

# 创建文档
echo "创建测试文档..."
create_response=$(curl -s -X POST "${BASE_URL}/rag/index" \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "travel_guides",
    "title": "测试文档",
    "content": "这是测试文档内容",
    "countryCode": "IS",
    "tags": ["test"]
  }')

doc_id=$(echo "$create_response" | jq -r '.data.id' 2>/dev/null)

if [ "$doc_id" != "null" ] && [ -n "$doc_id" ]; then
    echo -e "${GREEN}✅ 文档创建成功: ${doc_id}${NC}"
    echo ""
    
    # 等待索引完成
    echo "⏳ 等待3秒让文档索引完成..."
    sleep 3
    
    # 获取文档详情
    test_endpoint "获取文档详情" "GET" "/rag/documents/${doc_id}"
    
    # 更新文档
    test_endpoint "更新文档" "PUT" "/rag/documents/${doc_id}" '{
      "title": "更新后的测试文档",
      "tags": ["test", "updated"]
    }'
    
    echo "⚠️  测试文档未删除，ID: ${doc_id}"
    echo "   如需删除，请运行: curl -X DELETE ${BASE_URL}/rag/documents/${doc_id}"
else
    echo -e "${RED}❌ 文档创建失败${NC}"
    echo "$create_response" | jq '.' 2>/dev/null || echo "$create_response"
fi

# 获取文档列表
test_endpoint "获取文档列表" "GET" "/rag/documents?page=1&pageSize=5"
test_endpoint "按集合筛选" "GET" "/rag/documents?collection=travel_guides&page=1&pageSize=5"

echo "================================"
echo "✅ 测试完成！"
echo "================================"
