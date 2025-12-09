#!/bin/bash

# 测试机票价格 API 接口
BASE_URL="http://localhost:3000"

echo "🧪 测试机票价格 API 接口"
echo "================================"
echo ""

# 1. 估算价格（日本）
echo "📝 测试 1: 估算日本机票+签证成本（保守估算）"
echo "---"
curl -X GET "${BASE_URL}/flight-prices/estimate?countryCode=JP&useConservative=true" | jq '.'
echo ""
echo ""

# 2. 估算价格（日本，指定出发城市）
echo "📝 测试 2: 估算日本机票+签证成本（从北京出发）"
echo "---"
curl -X GET "${BASE_URL}/flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true" | jq '.'
echo ""
echo ""

# 3. 获取详细价格信息
echo "📝 测试 3: 获取日本详细价格信息"
echo "---"
curl -X GET "${BASE_URL}/flight-prices/details?countryCode=JP" | jq '.'
echo ""
echo ""

# 4. 获取所有价格参考数据
echo "📝 测试 4: 获取所有价格参考数据"
echo "---"
curl -X GET "${BASE_URL}/flight-prices" | jq '.[0:3]'  # 只显示前3条
echo ""
echo ""

# 5. 创建新的价格参考数据
echo "📝 测试 5: 创建新的价格参考数据（测试用）"
echo "---"
RESPONSE=$(curl -s -X POST "${BASE_URL}/flight-prices" \
  -H "Content-Type: application/json" \
  -d '{
    "countryCode": "TEST",
    "originCity": "TEST",
    "lowSeasonPrice": 1000,
    "highSeasonPrice": 2000,
    "visaCost": 100,
    "source": "测试数据",
    "notes": "这是测试数据，可以删除"
  }')
echo "$RESPONSE" | jq '.'
NEW_ID=$(echo "$RESPONSE" | jq -r '.id')
echo ""
echo ""

# 6. 根据 ID 查询
if [ "$NEW_ID" != "null" ] && [ "$NEW_ID" != "" ]; then
  echo "📝 测试 6: 根据 ID 查询价格参考数据 (ID: $NEW_ID)"
  echo "---"
  curl -X GET "${BASE_URL}/flight-prices/${NEW_ID}" | jq '.'
  echo ""
  echo ""

  # 7. 更新价格参考数据
  echo "📝 测试 7: 更新价格参考数据 (ID: $NEW_ID)"
  echo "---"
  curl -X PUT "${BASE_URL}/flight-prices/${NEW_ID}" \
    -H "Content-Type: application/json" \
    -d '{
      "lowSeasonPrice": 1200,
      "highSeasonPrice": 2200,
      "notes": "已更新"
    }' | jq '.'
  echo ""
  echo ""

  # 8. 删除测试数据
  echo "📝 测试 8: 删除测试数据 (ID: $NEW_ID)"
  echo "---"
  curl -X DELETE "${BASE_URL}/flight-prices/${NEW_ID}" | jq '.'
  echo ""
  echo ""
fi

# 9. 测试不同国家
echo "📝 测试 9: 测试不同国家的价格估算"
echo "---"
echo "泰国 (TH):"
curl -s -X GET "${BASE_URL}/flight-prices/estimate?countryCode=TH" | jq '.totalCost'
echo ""
echo "美国 (US):"
curl -s -X GET "${BASE_URL}/flight-prices/estimate?countryCode=US" | jq '.totalCost'
echo ""
echo "冰岛 (IS):"
curl -s -X GET "${BASE_URL}/flight-prices/estimate?countryCode=IS" | jq '.totalCost'
echo ""
echo ""

echo "✅ 测试完成！"
echo ""
echo "💡 API 接口列表："
echo "   GET  /flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true  - 估算价格"
echo "   GET  /flight-prices/details?countryCode=JP&originCity=PEK                        - 获取详细价格"
echo "   GET  /flight-prices                                                               - 获取所有数据"
echo "   GET  /flight-prices/:id                                                          - 根据 ID 查询"
echo "   POST /flight-prices                                                              - 创建数据"
echo "   PUT  /flight-prices/:id                                                          - 更新数据"
echo "   DELETE /flight-prices/:id                                                       - 删除数据"

