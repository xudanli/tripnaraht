#!/bin/bash
# 测试 Itinerary Items API 的脚本

echo "🧪 测试 Itinerary Items API"
echo ""

# 首先需要获取一个 TripDay ID
echo "📋 步骤 1: 获取 TripDay ID"
echo "请先运行 POST /trips 创建行程，然后从返回结果中获取 days[0].id"
echo ""

# 假设我们已经有了 TripDay ID 和 Place ID
TRIP_DAY_ID="your-trip-day-id-here"  # 替换为实际的 TripDay ID
PLACE_ID=1  # 替换为实际的 Place ID

echo "📋 步骤 2: 创建行程项（正常情况）"
echo "POST /itinerary-items"
echo ""

curl -X POST http://localhost:3000/itinerary-items \
  -H "Content-Type: application/json" \
  -d "{
    \"tripDayId\": \"${TRIP_DAY_ID}\",
    \"placeId\": ${PLACE_ID},
    \"type\": \"ACTIVITY\",
    \"startTime\": \"2024-05-01T10:00:00.000Z\",
    \"endTime\": \"2024-05-01T12:00:00.000Z\",
    \"note\": \"记得穿和服拍照\"
  }" | python3 -m json.tool

echo ""
echo ""
echo "📋 步骤 3: 测试智能校验（故意选关门时间）"
echo "POST /itinerary-items (凌晨 3 点)"
echo ""

curl -X POST http://localhost:3000/itinerary-items \
  -H "Content-Type: application/json" \
  -d "{
    \"tripDayId\": \"${TRIP_DAY_ID}\",
    \"placeId\": ${PLACE_ID},
    \"type\": \"ACTIVITY\",
    \"startTime\": \"2024-05-01T03:00:00.000Z\",
    \"endTime\": \"2024-05-01T04:00:00.000Z\"
  }" 2>&1

echo ""
echo ""
echo "✅ 测试完成！"
echo ""
echo "💡 提示："
echo "  - 如果看到 400 错误，说明智能校验正常工作"
echo "  - 如果看到 201 成功，说明时间在营业时间内"

