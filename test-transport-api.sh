#!/bin/bash
# 测试交通规划 API

BASE_URL="http://localhost:3000"

echo "🧪 测试交通规划 API"
echo "===================="
echo ""

# 测试 1: 国内路线（应该使用高德地图）
echo "📌 测试 1: 国内路线（北京 → 上海）"
echo "预期: 使用高德地图 API"
echo ""

curl -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 39.9042,
    "fromLng": 116.4074,
    "toLat": 31.2304,
    "toLng": 121.4737,
    "hasLuggage": false,
    "hasElderly": false,
    "isRaining": false,
    "budgetSensitivity": "MEDIUM"
  }' | jq '.' 2>/dev/null || echo "请求失败或 jq 未安装"

echo ""
echo "---"
echo ""

# 测试 2: 海外路线（应该使用 Google Routes）
echo "📌 测试 2: 海外路线（东京 → 大阪）"
echo "预期: 使用 Google Routes API"
echo ""

curl -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 35.6762,
    "fromLng": 139.6503,
    "toLat": 34.6937,
    "toLng": 135.5023,
    "hasLuggage": false,
    "hasElderly": false,
    "isRaining": false,
    "budgetSensitivity": "MEDIUM"
  }' | jq '.' 2>/dev/null || echo "请求失败或 jq 未安装"

echo ""
echo "---"
echo ""

# 测试 3: 市内短距离（步行推荐）
echo "📌 测试 3: 市内短距离（步行推荐）"
echo "预期: 推荐步行（如果距离 < 1.5km）"
echo ""

curl -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 35.6762,
    "fromLng": 139.6503,
    "toLat": 35.6812,
    "toLng": 139.7671,
    "hasLuggage": false,
    "hasElderly": false,
    "isRaining": false
  }' | jq '.' 2>/dev/null || echo "请求失败或 jq 未安装"

echo ""
echo "---"
echo ""

# 测试 4: 有老人同行（打车推荐）
echo "📌 测试 4: 有老人同行（打车推荐）"
echo "预期: 推荐打车（避免步行和换乘）"
echo ""

curl -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 35.6762,
    "fromLng": 139.6503,
    "toLat": 35.6812,
    "toLng": 139.7671,
    "hasElderly": true,
    "isRaining": true,
    "budgetSensitivity": "LOW"
  }' | jq '.' 2>/dev/null || echo "请求失败或 jq 未安装"

echo ""
echo "✅ 测试完成！"
echo ""
echo "💡 提示: 查看服务日志了解使用的 API（高德或Google）"

