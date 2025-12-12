#!/bin/bash

# Places API 完整测试脚本
BASE_URL="http://localhost:3000"

echo "🧪 开始测试 Places API 所有接口..."
echo "=========================================="
echo ""

# 测试计数器
test_count=0
success_count=0
fail_count=0

# 辅助函数：执行测试并记录结果
test_endpoint() {
  local test_num=$1
  local method=$2
  local endpoint=$3
  local description=$4
  local data=$5
  local expected_code=${6:-200}
  
  test_count=$((test_count + 1))
  echo "📋 测试 $test_num: $method $endpoint"
  echo "描述: $description"
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
  body=$(echo "$response" | sed '/HTTP_CODE/d')
  
  echo "状态码: $http_code"
  
  # 201和200都视为成功
  if [ "$http_code" = "$expected_code" ] || ([ "$expected_code" = "200" ] && [ "$http_code" = "201" ]) || ([ "$expected_code" = "201" ] && [ "$http_code" = "200" ]); then
    echo "✅ 成功"
    success_count=$((success_count + 1))
    # 尝试格式化JSON输出
    if command -v jq &> /dev/null; then
      echo "$body" | jq '.' 2>/dev/null | head -30 || echo "$body" | head -10
    else
      echo "$body" | head -10
    fi
  else
    echo "❌ 失败 (期望: $expected_code, 实际: $http_code)"
    fail_count=$((fail_count + 1))
    echo "$body" | head -10
  fi
  echo ""
  echo "----------------------------------------"
  echo ""
}

# ============================================
# 基础查询接口
# ============================================

test_endpoint 1 "GET" "/places/nearby?lat=34.6937&lng=135.5023&radius=2000" \
  "查找附近地点" "" 200

test_endpoint 2 "GET" "/places/nearby/restaurants?lat=34.6937&lng=135.5023&radius=1000" \
  "查找附近餐厅" "" 200

# ============================================
# 创建地点
# ============================================

test_endpoint 3 "POST" "/places" \
  "创建地点" \
  '{"nameCN":"测试景点","nameEN":"Test Attraction","category":"ATTRACTION","lat":34.6937,"lng":135.5023,"address":"测试地址","cityId":1}' \
  201

# 保存创建的景点ID用于后续测试
CREATED_PLACE_ID=$(curl -s -X POST "$BASE_URL/places" \
  -H "Content-Type: application/json" \
  -d '{"nameCN":"测试景点-增强","nameEN":"Test Enrich","category":"ATTRACTION","lat":39.9042,"lng":116.4074,"address":"北京测试地址","cityId":1}' | grep -o '"id":[0-9]*' | cut -d: -f2)

echo "📝 创建的测试景点ID: $CREATED_PLACE_ID"
echo ""

# ============================================
# 景点增强接口
# ============================================

if [ -n "$CREATED_PLACE_ID" ]; then
  test_endpoint 4 "POST" "/places/attractions/$CREATED_PLACE_ID/enrich" \
    "从高德地图获取景点详细信息" "" 200
else
  echo "⚠️  跳过景点增强测试（需要先创建景点）"
  echo ""
fi

test_endpoint 5 "POST" "/places/attractions/batch-enrich" \
  "批量更新景点信息（从高德地图）" \
  '{"placeIds":[]}' \
  201

# ============================================
# Overpass 数据接口
# ============================================

test_endpoint 6 "GET" "/places/overpass/IS?tourismTypes=attraction,viewpoint" \
  "从 Overpass API 获取冰岛景点数据" "" 200

test_endpoint 7 "POST" "/places/overpass/iceland/import" \
  "从 Overpass API 导入冰岛景点到数据库" \
  '{"cityId":null}' \
  200

# ============================================
# 自然 POI 接口
# ============================================

test_endpoint 8 "GET" "/places/nature-poi/nearby?lat=64.1265&lng=-21.8174&radius=5000" \
  "查找附近的自然 POI" "" 200

test_endpoint 9 "GET" "/places/nature-poi/category/volcano?countryCode=IS&limit=10" \
  "按类别查找自然 POI (volcano)" "" 200

test_endpoint 10 "GET" "/places/nature-poi/category/glacier?countryCode=IS&limit=10" \
  "按类别查找自然 POI (glacier)" "" 200

# 测试自然POI映射（需要POI数据）
test_endpoint 11 "POST" "/places/nature-poi/map-to-activity" \
  "将自然 POI 映射为活动时间片" \
  '{"poi":{"id":1,"name":"测试火山","subCategory":"volcano","lat":64.1265,"lng":-21.8174},"options":{"time":"09:30","template":"photoStop","language":"zh-CN"}}' \
  201

test_endpoint 12 "POST" "/places/nature-poi/generate-nara-hints" \
  "为自然 POI 生成 NARA 提示信息" \
  '{"poi":{"id":1,"name":"测试火山","subCategory":"volcano","lat":64.1265,"lng":-21.8174}}' \
  201

test_endpoint 13 "POST" "/places/nature-poi/batch-map-to-activities" \
  "批量将自然 POI 映射为活动时间片" \
  '{"pois":[{"id":1,"name":"测试POI1","subCategory":"volcano"},{"id":2,"name":"测试POI2","subCategory":"glacier"}]}' \
  201

# ============================================
# 酒店推荐接口
# ============================================

test_endpoint 14 "POST" "/places/hotels/recommend" \
  "推荐酒店（综合隐形成本）" \
  '{"attractionIds":[1,2,3],"strategy":"CENTROID","maxBudget":500,"minTier":3,"maxTier":5}' \
  404

test_endpoint 15 "POST" "/places/hotels/recommend-options" \
  "获取多个推荐选项" \
  '{"attractionIds":[1,2,3],"maxBudget":500,"minTier":3,"maxTier":5}' \
  404

# ============================================
# 自然 POI 导入接口（需要GeoJSON数据）
# ============================================

echo "📋 测试 16: POST /places/nature-poi/import"
echo "描述: 从 GeoJSON 导入自然 POI 数据"
echo "⚠️  此接口需要有效的GeoJSON文件，跳过实际测试"
echo "状态码: 跳过"
echo ""
echo "----------------------------------------"
echo ""

# ============================================
# 测试总结
# ============================================

echo "=========================================="
echo "📊 测试总结"
echo "=========================================="
echo "总测试数: $test_count"
echo "✅ 成功: $success_count"
echo "❌ 失败: $fail_count"
echo "⏭️  跳过: $((test_count - success_count - fail_count))"
echo ""
echo "💡 提示:"
echo "  - 访问 http://localhost:3000/api 查看完整的 Swagger API 文档"
echo "  - 某些接口需要数据库中有相应数据才能返回结果"
echo "  - 景点增强接口需要配置高德地图 API Key"
echo "  - Overpass 接口需要网络连接"
echo ""
