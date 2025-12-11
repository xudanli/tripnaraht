#!/bin/bash
# 简化版交通规划 API 测试脚本

BASE_URL="http://localhost:3000"

echo "🧪 交通规划 API 测试"
echo "===================="
echo ""

# 测试 1: 国内市内路线（应使用高德地图）
echo "📌 测试 1: 国内市内路线（北京天安门 → 故宫）"
echo "坐标: 39.9042,116.4074 → 39.9163,116.3972"
echo "预期: 使用高德地图 API"
echo ""

RESPONSE=$(curl -s -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 39.9042,
    "fromLng": 116.4074,
    "toLat": 39.9163,
    "toLng": 116.3972,
    "hasLuggage": false,
    "hasElderly": false,
    "isRaining": false
  }')

echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print('✅ 成功返回'); print(f'推荐方式: {data[\"options\"][0][\"mode\"] if data.get(\"options\") else \"无\"}'); print(f'时长: {data[\"options\"][0][\"durationMinutes\"] if data.get(\"options\") else \"无\"} 分钟'); print(f'费用: {data[\"options\"][0][\"cost\"]/100 if data.get(\"options\") and data[\"options\"][0].get(\"cost\") else \"无\"} 元')" 2>/dev/null || echo "$RESPONSE"

echo ""
echo "---"
echo ""

# 测试 2: 海外市内路线（应使用 Google Routes）
echo "📌 测试 2: 海外市内路线（东京站 → 新宿站）"
echo "坐标: 35.6812,139.7671 → 35.6896,139.7006"
echo "预期: 使用 Google Routes API"
echo ""

RESPONSE=$(curl -s -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 35.6812,
    "fromLng": 139.7671,
    "toLat": 35.6896,
    "toLng": 139.7006,
    "hasLuggage": false,
    "hasElderly": false,
    "isRaining": false
  }')

echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print('✅ 成功返回'); print(f'推荐方式: {data[\"options\"][0][\"mode\"] if data.get(\"options\") else \"无\"}'); print(f'时长: {data[\"options\"][0][\"durationMinutes\"] if data.get(\"options\") else \"无\"} 分钟'); print(f'费用: {data[\"options\"][0][\"cost\"]/100 if data.get(\"options\") and data[\"options\"][0].get(\"cost\") else \"无\"} 元')" 2>/dev/null || echo "$RESPONSE"

echo ""
echo "---"
echo ""

# 测试 3: 有老人同行
echo "📌 测试 3: 有老人同行（应推荐打车）"
echo ""

RESPONSE=$(curl -s -X POST "${BASE_URL}/transport/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 35.6762,
    "fromLng": 139.6503,
    "toLat": 35.6812,
    "toLng": 139.7671,
    "hasElderly": true,
    "isRaining": true,
    "budgetSensitivity": "LOW"
  }')

echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print('✅ 成功返回'); print(f'推荐方式: {data[\"options\"][0][\"mode\"] if data.get(\"options\") else \"无\"}'); print(f'推荐理由: {data.get(\"recommendationReason\", \"无\")}')" 2>/dev/null || echo "$RESPONSE"

echo ""
echo "✅ 测试完成！"
echo ""
echo "💡 查看服务日志确认使用的 API："
echo "   tail -f /tmp/nestjs.log | grep -E '高德|Amap|Google|SmartRoutes'"
