#!/bin/bash
# 快速测试创建地点管理接口的脚本

API_URL="http://localhost:3000/places/admin"

echo "=== 测试创建地点管理接口 ==="
echo ""

# 检查服务是否运行
echo "检查服务状态..."
if ! curl -s http://localhost:3000/api-docs > /dev/null 2>&1; then
    echo "❌ 服务未运行，请先启动: npm run dev"
    exit 1
fi

echo "✅ 服务运行中"
echo ""

# 测试1: 基本创建
echo "📋 测试 1: 基本创建（必填字段）"
TIMESTAMP=$(date +%s)
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"nameCN\": \"测试景点_${TIMESTAMP}\",
    \"category\": \"ATTRACTION\",
    \"lat\": 64.1466,
    \"lng\": -21.9426,
    \"cityId\": 1
  }")

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# 提取创建的ID（如果成功）
PLACE_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty' 2>/dev/null)

if [ -n "$PLACE_ID" ] && [ "$PLACE_ID" != "null" ]; then
    echo "✅ 成功创建地点，ID: $PLACE_ID"
    echo ""
    
    # 测试2: 完整字段创建
    echo "📋 测试 2: 完整字段创建"
    RESPONSE2=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d "{
        \"nameCN\": \"完整测试景点_${TIMESTAMP}\",
        \"nameEN\": \"Complete Test Attraction_${TIMESTAMP}\",
        \"category\": \"ATTRACTION\",
        \"lat\": 64.9244,
        \"lng\": -23.3122,
        \"address\": \"Grundarfjörður, Iceland\",
        \"cityId\": 1,
        \"rating\": 4.8,
        \"description\": \"这是一个完整的测试景点\",
        \"metadata\": {
          \"openingHours\": \"24/7\",
          \"bestTimeToVisit\": \"sunset\",
          \"tags\": [\"photography\", \"nature\"]
        }
      }")
    
    echo "$RESPONSE2" | jq '.' 2>/dev/null || echo "$RESPONSE2"
    echo ""
    
    # 测试3: 错误情况 - 缺少必填字段
    echo "📋 测试 3: 错误情况 - 缺少必填字段"
    RESPONSE3=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d "{
        \"category\": \"ATTRACTION\",
        \"lat\": 64.1466,
        \"lng\": -21.9426,
        \"cityId\": 1
      }")
    
    echo "$RESPONSE3" | jq '.' 2>/dev/null || echo "$RESPONSE3"
    echo ""
    
    echo "✅ 测试完成！"
    echo ""
    echo "如需删除测试数据，可以使用:"
    echo "curl -X DELETE http://localhost:3000/places/admin/$PLACE_ID"
else
    echo "⚠️  第一个测试失败，请检查服务状态和数据库连接"
fi
