#!/bin/bash

# 测试脚本：验证酒店推荐 API
# 使用方法：./test-hotel-recommendation.sh [STRATEGY] [TRIP_ID]

BASE_URL="http://localhost:3000"
STRATEGY="${1:-HUB}"
TRIP_ID="${2:-}"

echo "🏨 测试酒店推荐 API"
echo ""

if [ -z "$TRIP_ID" ]; then
  echo "⚠️  警告：未提供 tripId，将使用 attractionIds 测试"
  echo ""
fi

echo "📋 请求信息："
echo "  URL: POST $BASE_URL/places/hotels/recommend"
echo "  策略: $STRATEGY"
if [ -n "$TRIP_ID" ]; then
  echo "  行程 ID: $TRIP_ID"
else
  echo "  景点 IDs: [1, 2, 3] (示例)"
fi
echo ""

# 构建请求体
if [ -n "$TRIP_ID" ]; then
  REQUEST_BODY=$(cat <<EOF
{
  "tripId": "$TRIP_ID",
  "strategy": "$STRATEGY",
  "maxBudget": 2000,
  "includeHiddenCost": true,
  "timeValuePerHour": 50
}
EOF
)
else
  REQUEST_BODY=$(cat <<EOF
{
  "attractionIds": [1, 2, 3],
  "strategy": "$STRATEGY",
  "maxBudget": 2000,
  "includeHiddenCost": true,
  "timeValuePerHour": 50
}
EOF
)
fi

echo "📡 发送请求..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$BASE_URL/places/hotels/recommend" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "📊 响应状态: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ 请求成功！"
  echo ""
  echo "📦 推荐结果（前3个）："
  echo "$BODY" | jq '.[0:3] | .[] | {
    name: .name,
    roomRate: .roomRate,
    tier: .tier,
    totalCost: .totalCost,
    reason: .recommendationReason
  }' 2>/dev/null || echo "$BODY" | jq '.[0:3]' 2>/dev/null || echo "$BODY"
  
  echo ""
  echo "💰 成本分析（第一个酒店）："
  echo "$BODY" | jq '.[0].costBreakdown' 2>/dev/null || echo "未计算隐形成本"
  
  echo ""
  echo "📍 位置评分（第一个酒店）："
  echo "$BODY" | jq '.[0].locationScore' 2>/dev/null || echo "无位置评分数据"
  
else
  echo "❌ 请求失败"
  echo ""
  echo "错误信息："
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
fi

echo ""
echo "---"
echo "💡 提示："
echo "  测试不同策略："
echo "    ./test-hotel-recommendation.sh CENTROID <TRIP_ID>"
echo "    ./test-hotel-recommendation.sh HUB <TRIP_ID>"
echo "    ./test-hotel-recommendation.sh RESORT <TRIP_ID>"

