#!/bin/bash

# 测试脚本：验证交通规划 API
# 使用方法：./test-transport-plan.sh [SCENARIO]

BASE_URL="http://localhost:3000"
SCENARIO="${1:-normal}"

echo "🚗 测试交通规划 API"
echo ""

case $SCENARIO in
  "normal")
    echo "📋 场景：正常市内交通"
    REQUEST_BODY='{
      "fromLat": 35.6762,
      "fromLng": 139.6503,
      "toLat": 35.6812,
      "toLng": 139.7671,
      "hasLuggage": false,
      "hasElderly": false,
      "isRaining": false,
      "budgetSensitivity": "MEDIUM"
    }'
    ;;
  "elderly")
    echo "📋 场景：有老人同行 + 下雨"
    REQUEST_BODY='{
      "fromLat": 35.6762,
      "fromLng": 139.6503,
      "toLat": 35.6812,
      "toLng": 139.7671,
      "hasElderly": true,
      "isRaining": true,
      "budgetSensitivity": "LOW"
    }'
    ;;
  "luggage")
    echo "📋 场景：换酒店日（带行李）"
    REQUEST_BODY='{
      "fromLat": 35.6762,
      "fromLng": 139.6503,
      "toLat": 35.6812,
      "toLng": 139.7671,
      "hasLuggage": true,
      "isMovingDay": true,
      "currentCity": "JP",
      "targetCity": "JP",
      "budgetSensitivity": "MEDIUM"
    }'
    ;;
  "intercity")
    echo "📋 场景：城市间交通（东京 -> 大阪）"
    REQUEST_BODY='{
      "fromLat": 35.6762,
      "fromLng": 139.6503,
      "toLat": 34.6937,
      "toLng": 135.5023,
      "hasLuggage": true,
      "budgetSensitivity": "HIGH",
      "timeSensitivity": "MEDIUM"
    }'
    ;;
  *)
    echo "❌ 未知场景: $SCENARIO"
    echo "可用场景: normal, elderly, luggage, intercity"
    exit 1
    ;;
esac

echo "📡 发送请求..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$BASE_URL/transport/plan" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "📊 响应状态: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ 请求成功！"
  echo ""
  echo "🎯 推荐理由："
  echo "$BODY" | jq -r '.recommendationReason' 2>/dev/null || echo "无法解析"
  
  echo ""
  echo "📋 推荐选项（前3个）："
  echo "$BODY" | jq '.options[0:3] | .[] | {
    mode: .mode,
    duration: "\(.durationMinutes) 分钟",
    cost: "\(.cost) 元",
    score: .score,
    reason: .recommendationReason,
    warnings: .warnings
  }' 2>/dev/null || echo "$BODY" | jq '.options[0:3]' 2>/dev/null
  
  echo ""
  echo "💡 特殊建议："
  echo "$BODY" | jq -r '.specialAdvice[]?' 2>/dev/null || echo "无特殊建议"
  
else
  echo "❌ 请求失败"
  echo ""
  echo "错误信息："
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
fi

echo ""
echo "---"
echo "💡 提示："
echo "  测试不同场景："
echo "    ./test-transport-plan.sh normal"
echo "    ./test-transport-plan.sh elderly"
echo "    ./test-transport-plan.sh luggage"
echo "    ./test-transport-plan.sh intercity"

