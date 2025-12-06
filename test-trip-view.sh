#!/bin/bash

# 测试脚本：验证全景行程视图 API
# 使用方法：./test-trip-view.sh [TRIP_ID]

BASE_URL="http://localhost:3000"
TRIP_ID="${1:-}"

echo "🧪 测试全景行程视图 API"
echo ""

if [ -z "$TRIP_ID" ]; then
  echo "❌ 错误：请提供行程 ID"
  echo ""
  echo "使用方法："
  echo "  ./test-trip-view.sh <TRIP_ID>"
  echo ""
  echo "或者先获取所有行程列表："
  echo "  curl -X GET $BASE_URL/trips | jq '.[0].id'"
  echo ""
  exit 1
fi

echo "📋 请求信息："
echo "  URL: GET $BASE_URL/trips/$TRIP_ID"
echo "  行程 ID: $TRIP_ID"
echo ""

echo "📡 发送请求..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/trips/$TRIP_ID")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "📊 响应状态: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ 请求成功！"
  echo ""
  echo "📦 返回数据结构："
  echo "$BODY" | jq '{
    id,
    destination,
    stats: {
      totalDays: .stats.totalDays,
      daysWithActivities: .stats.daysWithActivities,
      totalItems: .stats.totalItems,
      totalActivities: .stats.totalActivities,
      progress: .stats.progress
    },
    days: [.days[] | {
      date,
      itemCount: (.items | length),
      items: [.items[] | {
        type,
        startTime,
        endTime,
        place: .place | {
          name,
          nameEN,
          category
        }
      }]
    }]
  }' 2>/dev/null || echo "$BODY"
  
  echo ""
  echo "📈 统计信息："
  echo "$BODY" | jq '.stats' 2>/dev/null || echo "无法解析统计信息"
  
  echo ""
  echo "📅 行程天数："
  echo "$BODY" | jq '.days | length' 2>/dev/null || echo "无法解析天数"
  
  echo ""
  echo "🎯 活动详情："
  echo "$BODY" | jq '.days[] | select(.items | length > 0) | {
    date,
    activities: [.items[] | {
      type,
      time: "\(.startTime) - \(.endTime)",
      place: .place.name
    }]
  }' 2>/dev/null || echo "无法解析活动详情"
  
else
  echo "❌ 请求失败"
  echo ""
  echo "错误信息："
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
fi

echo ""
echo "---"
echo "💡 提示：使用 jq 格式化 JSON 输出"
echo "   curl -X GET $BASE_URL/trips/$TRIP_ID | jq '.'"

